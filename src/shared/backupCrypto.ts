import { StorageError } from "./storageProvider"
import {
	DEFAULT_ARGON2_PARAMS,
	VAULT_KEY_BYTES,
	deriveKey,
	deriveKeyAsync,
	fromBase64Url,
	generateSalt,
	toBase64Url,
	type Argon2Params,
} from "./vaultCrypto"

export const BACKUP_VERSION = 1
export const BACKUP_IV_BYTES = 12

export interface EncryptedBackupEnvelope {
	v: number
	kdf: "argon2id"
	salt: string // base64url
	iv: string // base64url 12 bytes
	tag: string // base64url 16 bytes
	data: string // base64url ciphertext
	params: Argon2Params
	app: "PR5Auth"
	createdAt: number
}

function getNodeCrypto(): typeof import("node:crypto") | null {
	try {
		const im = import.meta as unknown as { require?: (id: string) => unknown }
		if (im && typeof im.require === "function") {
			const c = im.require("node:crypto") as typeof import("node:crypto")
			if (c && typeof c.createCipheriv === "function" && typeof c.createDecipheriv === "function") return c
		}
	} catch {}
	try {
		const g = globalThis as unknown as { require?: (id: string) => unknown }
		if (typeof g.require === "function") {
			const c = g.require("node:crypto") as typeof import("node:crypto")
			if (c && typeof c.createCipheriv === "function" && typeof c.createDecipheriv === "function") return c
		}
	} catch {}
	try {
		const r = (eval as unknown as (s: string) => unknown)("require") as (id: string) => unknown
		if (typeof r === "function") {
			const c = r("node:crypto") as typeof import("node:crypto")
			if (c && typeof c.createCipheriv === "function" && typeof c.createDecipheriv === "function") return c
		}
	} catch {}
	return null
}

function toBuffer(u8: Uint8Array): Buffer {
	return Buffer.from(u8)
}

function assertBackupEnvelope(obj: unknown): asserts obj is EncryptedBackupEnvelope {
	if (typeof obj !== "object" || obj === null) throw new StorageError("Backup file is not valid JSON", "corrupt")
	const o = obj as Record<string, unknown>
	if (o.v !== BACKUP_VERSION) throw new StorageError("Unsupported backup version", "corrupt")
	if (o.kdf !== "argon2id") throw new StorageError("Unsupported KDF", "corrupt")
	if (typeof o.salt !== "string" || typeof o.iv !== "string" || typeof o.tag !== "string" || typeof o.data !== "string") {
		throw new StorageError("Backup file has invalid structure", "corrupt")
	}
	if (typeof o.params !== "object" || o.params === null) throw new StorageError("Backup file has invalid KDF params", "corrupt")
	const p = o.params as Record<string, unknown>
	if (typeof p.t !== "number" || typeof p.m !== "number" || typeof p.p !== "number") {
		throw new StorageError("Backup file has invalid KDF params", "corrupt")
	}
	// Basic sanity — prevents absurd memory DoS
	if (p.t < 1 || p.m < 8 * 1024 || p.p < 1) throw new StorageError("Backup KDF params out of range", "corrupt")
}

function encryptWithNode(plaintext: string, key: Uint8Array, iv: Uint8Array): { tag: Uint8Array; data: Uint8Array } {
	const nodeCrypto = getNodeCrypto()!
	const cipher = (nodeCrypto as unknown as { createCipheriv: (a: string, k: Uint8Array, iv: Uint8Array) => import("node:crypto").CipherGCM }).createCipheriv("aes-256-gcm", key as unknown as Uint8Array, iv as unknown as Uint8Array)
	const parts = [cipher.update(plaintext, "utf8"), cipher.final()]
	const encrypted = Buffer.alloc(parts.reduce((t, p) => t + p.length, 0))
	let off = 0
	for (const part of parts) {
		encrypted.set(part, off)
		off += part.length
	}
	const tag = cipher.getAuthTag()
	return { tag: new Uint8Array(tag), data: new Uint8Array(encrypted) }
}

function decryptWithNode(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array, tag: Uint8Array): string {
	const nodeCrypto = getNodeCrypto()!
	try {
		const decipher = (nodeCrypto as unknown as { createDecipheriv: (a: string, k: Uint8Array, iv: Uint8Array) => import("node:crypto").DecipherGCM }).createDecipheriv("aes-256-gcm", key as unknown as Uint8Array, iv as unknown as Uint8Array)
		decipher.setAuthTag(tag as unknown as Uint8Array)
		const parts = [decipher.update(ciphertext as unknown as Uint8Array), decipher.final()]
		const out = Buffer.alloc(parts.reduce((t, p) => t + p.length, 0))
		let off = 0
		for (const part of parts) {
			out.set(part, off)
			off += part.length
		}
		return out.toString("utf8")
	} catch {
		throw new StorageError("Backup could not be decrypted (wrong password or corrupted file)", "unrecoverable")
	}
}

async function encryptWithSubtle(plaintext: string, key: Uint8Array, iv: Uint8Array): Promise<{ tag: Uint8Array; data: Uint8Array }> {
	const subtle = globalThis.crypto.subtle
	const cryptoKey = await subtle.importKey("raw", key.slice() as unknown as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt"])
	const pt = new TextEncoder().encode(plaintext)
	// Subtle AES-GCM appends tag to ciphertext
	const combined = await subtle.encrypt({ name: "AES-GCM", iv: iv.slice() as unknown as ArrayBuffer, tagLength: 128 }, cryptoKey, pt)
	const buf = new Uint8Array(combined)
	const tag = buf.slice(buf.length - 16)
	const data = buf.slice(0, buf.length - 16)
	return { tag, data }
}

async function decryptWithSubtle(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array, tag: Uint8Array): Promise<string> {
	const subtle = globalThis.crypto.subtle
	const cryptoKey = await subtle.importKey("raw", key.slice() as unknown as ArrayBuffer, { name: "AES-GCM" }, false, ["decrypt"])
	const combined = new Uint8Array(ciphertext.length + tag.length)
	combined.set(ciphertext, 0)
	combined.set(tag, ciphertext.length)
	try {
		const plainBuf = await subtle.decrypt({ name: "AES-GCM", iv: iv.slice() as unknown as ArrayBuffer, tagLength: 128 }, cryptoKey, combined)
		return new TextDecoder().decode(plainBuf)
	} catch {
		throw new StorageError("Backup could not be decrypted (wrong password or corrupted file)", "unrecoverable")
	}
}

function generateIv(bytes = BACKUP_IV_BYTES): Uint8Array {
	const out = new Uint8Array(bytes)
	if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
		globalThis.crypto.getRandomValues(out)
		return out
	}
	const nodeCrypto = getNodeCrypto()
	if (nodeCrypto) return new Uint8Array(nodeCrypto.randomBytes(bytes))
	throw new Error("No secure random source for IV")
}

export function isEncryptedBackup(payload: string): boolean {
	try {
		const parsed = JSON.parse(payload) as Record<string, unknown>
		return parsed?.v === BACKUP_VERSION && parsed?.kdf === "argon2id" && typeof parsed.salt === "string" && typeof parsed.iv === "string" && typeof parsed.tag === "string" && typeof parsed.data === "string"
	} catch {
		return false
	}
}

export function validateEncryptedBackupStructure(payload: string): EncryptedBackupEnvelope {
	let parsed: unknown
	try {
		parsed = JSON.parse(payload)
	} catch {
		throw new StorageError("Backup file is not valid JSON", "corrupt")
	}
	assertBackupEnvelope(parsed)
	// Additional length checks
	const saltBytes = fromBase64Url(parsed.salt)
	const ivBytes = fromBase64Url(parsed.iv)
	const tagBytes = fromBase64Url(parsed.tag)
	// fromBase64Url does not validate length; check
	if (saltBytes.length < 8) throw new StorageError("Backup salt is too short", "corrupt")
	if (ivBytes.length !== BACKUP_IV_BYTES) throw new StorageError("Backup IV has invalid length", "corrupt")
	if (tagBytes.length !== 16) throw new StorageError("Backup tag has invalid length", "corrupt")
	if (parsed.data.length === 0) throw new StorageError("Backup data is empty", "corrupt")
	return parsed
}

/**
 * Encrypt plaintext (vault JSON) with password using AES-256-GCM.
 * KDF: Argon2id via vaultCrypto deriveKey.
 * Returns JSON string of EncryptedBackupEnvelope.
 */
export function encryptBackup(
	plaintext: string,
	password: string,
	params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): string {
	if (!password || password.length < 8) throw new StorageError("Export password must be at least 8 characters", "denied")
	const salt = generateSalt()
	const key = deriveKey(password, salt, params)
	const iv = generateIv()
	let tag: Uint8Array
	let data: Uint8Array
	const nodeCrypto = getNodeCrypto()
	if (nodeCrypto) {
		const res = encryptWithNode(plaintext, key, iv)
		tag = res.tag
		data = res.data
	} else {
		// Fallback should not happen in sync path for browser – require async variant
		throw new StorageError("Sync backup encryption unavailable in this environment — use encryptBackupAsync", "unavailable")
	}
	// Best-effort zero key
	key.fill(0)
	const envelope: EncryptedBackupEnvelope = {
		v: BACKUP_VERSION,
		kdf: "argon2id",
		salt: toBase64Url(salt),
		iv: toBase64Url(iv),
		tag: toBase64Url(tag),
		data: toBase64Url(data),
		params,
		app: "PR5Auth",
		createdAt: Date.now(),
	}
	return JSON.stringify(envelope)
}

export function decryptBackup(payload: string, password: string): string {
	if (!password) throw new StorageError("Password required to decrypt backup", "denied")
	const envelope = validateEncryptedBackupStructure(payload)
	const salt = fromBase64Url(envelope.salt)
	const iv = fromBase64Url(envelope.iv)
	const tag = fromBase64Url(envelope.tag)
	const data = fromBase64Url(envelope.data)
	let key: Uint8Array
	try {
		key = deriveKey(password, salt, envelope.params)
	} catch (err) {
		throw new StorageError(`Key derivation failed: ${(err as Error).message}`, "unrecoverable")
	}
	// Validate key length
	if (key.length !== VAULT_KEY_BYTES) throw new StorageError("Derived key has invalid length", "corrupt")
	const nodeCrypto = getNodeCrypto()
	let plain: string
	if (nodeCrypto) {
		plain = decryptWithNode(data, key, iv, tag)
	} else {
		throw new StorageError("Sync backup decryption unavailable in this environment — use decryptBackupAsync", "unavailable")
	}
	key.fill(0)
	return plain
}

export async function encryptBackupAsync(
	plaintext: string,
	password: string,
	params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<string> {
	if (!password || password.length < 8) throw new StorageError("Export password must be at least 8 characters", "denied")
	const salt = generateSalt()
	const key = await deriveKeyAsync(password, salt, params)
	const iv = generateIv()
	let tag: Uint8Array
	let data: Uint8Array
	const nodeCrypto = getNodeCrypto()
	if (nodeCrypto) {
		const res = encryptWithNode(plaintext, key, iv)
		tag = res.tag
		data = res.data
	} else if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
		const res = await encryptWithSubtle(plaintext, key, iv)
		tag = res.tag
		data = res.data
	} else {
		throw new StorageError("No AES-256-GCM implementation available", "unavailable")
	}
	key.fill(0)
	const envelope: EncryptedBackupEnvelope = {
		v: BACKUP_VERSION,
		kdf: "argon2id",
		salt: toBase64Url(salt),
		iv: toBase64Url(iv),
		tag: toBase64Url(tag),
		data: toBase64Url(data),
		params,
		app: "PR5Auth",
		createdAt: Date.now(),
	}
	return JSON.stringify(envelope)
}

export async function decryptBackupAsync(payload: string, password: string): Promise<string> {
	if (!password) throw new StorageError("Password required to decrypt backup", "denied")
	const envelope = validateEncryptedBackupStructure(payload)
	const salt = fromBase64Url(envelope.salt)
	const iv = fromBase64Url(envelope.iv)
	const tag = fromBase64Url(envelope.tag)
	const data = fromBase64Url(envelope.data)
	const key = await deriveKeyAsync(password, salt, envelope.params)
	if (key.length !== VAULT_KEY_BYTES) throw new StorageError("Derived key has invalid length", "corrupt")
	const nodeCrypto = getNodeCrypto()
	let plain: string
	if (nodeCrypto) {
		plain = decryptWithNode(data, key, iv, tag)
	} else if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
		plain = await decryptWithSubtle(data, key, iv, tag)
	} else {
		throw new StorageError("No AES-256-GCM implementation available", "unavailable")
	}
	key.fill(0)
	return plain
}

// Aliases for ergonomics
export const createEncryptedBackup = encryptBackup
export const restoreEncryptedBackup = decryptBackup
