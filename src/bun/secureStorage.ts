import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
} from "node:crypto"
import { chmod, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises"
import { platform } from "node:os"
import path from "node:path"
import {
	StorageError,
} from "../shared/storageProvider"
import type { StorageProvider, StorageStatus } from "../shared/storageProvider"
import { createKeyStorage } from "./keychain"
import type { KeyStorage } from "./keychain"

const ALGORITHM = "aes-256-gcm"
const IV_SIZE = 12
const FILE_MODE = 0o600

export function getDataDir(): string {
	const override = process.env.PR5AUTH_DATA_DIR
	if (override) return override

	const current = platform()
	const home = process.env.HOME ?? process.env.USERPROFILE ?? "."
	if (current === "darwin") {
		return path.join(home, "Library", "Application Support", "PR5Auth")
	}
	if (current === "win32") {
		const appData = process.env.APPDATA
		return appData
			? path.join(appData, "PR5Auth")
			: path.join(home, "AppData", "Roaming", "PR5Auth")
	}
	const xdg = process.env.XDG_DATA_HOME
	return xdg ? path.join(xdg, "PR5Auth") : path.join(home, ".local", "share", "PR5Auth")
}

function toBase64Url(buf: Uint8Array): string {
	return Buffer.from(buf).toString("base64url")
}

function fromBase64Url(value: string): Buffer {
	return Buffer.from(value, "base64url")
}

export function encrypt(data: string, key: Uint8Array): string {
	const iv = new Uint8Array(randomBytes(IV_SIZE))
	const cipher = createCipheriv(ALGORITHM, key, iv)
	const parts = [cipher.update(data, "utf8"), cipher.final()]
	const encrypted = Buffer.alloc(
		parts.reduce((total, part) => total + part.length, 0),
	)
	let offset = 0
	for (const part of parts) {
		encrypted.set(part, offset)
		offset += part.length
	}
	const tag = cipher.getAuthTag()
	return JSON.stringify({
		v: 1,
		iv: toBase64Url(iv),
		tag: toBase64Url(new Uint8Array(tag)),
		data: toBase64Url(new Uint8Array(encrypted)),
	})
}

export function decrypt(payload: string, key: Uint8Array): string {
	let parsed: { v: number; iv: string; tag: string; data: string }
	try {
		parsed = JSON.parse(payload) as {
			v: number
			iv: string
			tag: string
			data: string
		}
	} catch {
		throw new StorageError("Encrypted value is not valid JSON", "corrupt")
	}

	if (
		parsed?.v !== 1 ||
		typeof parsed.iv !== "string" ||
		typeof parsed.tag !== "string" ||
		typeof parsed.data !== "string"
	) {
		throw new StorageError("Encrypted value has an invalid structure", "corrupt")
	}

	try {
		const decipher = createDecipheriv(
			ALGORITHM,
			key,
			new Uint8Array(fromBase64Url(parsed.iv)),
		)
		decipher.setAuthTag(new Uint8Array(fromBase64Url(parsed.tag)))
		const parts = [
			decipher.update(new Uint8Array(fromBase64Url(parsed.data))),
			decipher.final(),
		]
		const decrypted = Buffer.alloc(
			parts.reduce((total, part) => total + part.length, 0),
		)
		let offset = 0
		for (const part of parts) {
			decrypted.set(part, offset)
			offset += part.length
		}
		return decrypted.toString("utf8")
	} catch {
		throw new StorageError(
			"Encrypted value could not be decrypted (tampered or wrong key)",
			"unrecoverable",
		)
	}
}

export class EncryptedFileStorageProvider implements StorageProvider {
	private dataDir: string
	private keyStorage: KeyStorage
	private keyCache: Uint8Array | null = null

	constructor(dataDir: string, keyStorage: KeyStorage) {
		this.dataDir = dataDir
		this.keyStorage = keyStorage
	}

	private async getKey(): Promise<Uint8Array> {
		if (this.keyCache) return this.keyCache
		try {
			this.keyCache = await this.keyStorage.getKey()
			return this.keyCache
		} catch (err) {
			throw new StorageError(
				`Could not access key storage: ${(err as Error).message}`,
				"unavailable",
			)
		}
	}

	private filePath(key: string): string {
		return path.join(this.dataDir, `${toBase64Url(new Uint8Array(Buffer.from(key)))}.enc`)
	}

	async getItem(key: string): Promise<string | null> {
		const k = await this.getKey()
		let raw: Buffer
		try {
			raw = await readFile(this.filePath(key))
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
			throw new StorageError(
				`Could not read vault file: ${(err as Error).message}`,
				"io",
			)
		}
		return decrypt(raw.toString("utf8"), k)
	}

	async setItem(key: string, value: string): Promise<void> {
		const k = await this.getKey()
		try {
			await mkdir(this.dataDir, { recursive: true })
		} catch (err) {
			throw new StorageError(
				`Could not create data directory: ${(err as Error).message}`,
				"io",
			)
		}
		const payload = encrypt(value, k)
		const file = this.filePath(key)
		try {
			await writeFile(file, payload, { mode: FILE_MODE })
			await chmod(file, FILE_MODE)
		} catch (err) {
			throw new StorageError(
				`Could not write vault file: ${(err as Error).message}`,
				"io",
			)
		}
	}

	async removeItem(key: string): Promise<void> {
		try {
			await unlink(this.filePath(key))
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
				throw new StorageError(
					`Could not remove vault file: ${(err as Error).message}`,
					"io",
				)
			}
		}
	}

	async reset(): Promise<void> {
		try {
			const entries = await readdir(this.dataDir).catch(
				() => [] as string[],
			)
			await Promise.all(
				entries
					.filter((entry) => entry.endsWith(".enc"))
					.map((entry) =>
						unlink(path.join(this.dataDir, entry)).catch(() => undefined),
					),
			)
		} catch (err) {
			throw new StorageError(
				`Could not reset vault: ${(err as Error).message}`,
				"io",
			)
		}
	}

	async getStatus(): Promise<StorageStatus> {
		return {
			platform: platform(),
			kind: "file-encrypted",
			available: true,
			detail: `${this.keyStorage.detail} · AES-256-GCM`,
		}
	}
}

export class UnavailableStorageProvider implements StorageProvider {
	private reason: string

	constructor(reason: string) {
		this.reason = reason
	}

	async getItem(): Promise<string | null> {
		throw new StorageError(
			`Encrypted storage unavailable: ${this.reason}`,
			"unavailable",
		)
	}

	async setItem(): Promise<void> {
		throw new StorageError(
			`Encrypted storage unavailable: ${this.reason}`,
			"unavailable",
		)
	}

	async removeItem(): Promise<void> {
		throw new StorageError(
			`Encrypted storage unavailable: ${this.reason}`,
			"unavailable",
		)
	}

	async reset(): Promise<void> {
		throw new StorageError(
			`Encrypted storage unavailable: ${this.reason}`,
			"unavailable",
		)
	}

	async getStatus(): Promise<StorageStatus> {
		return {
			platform: platform(),
			kind: "unknown",
			available: false,
			detail: this.reason,
		}
	}
}

export async function createSecureStorageBackend(): Promise<
	EncryptedFileStorageProvider | UnavailableStorageProvider
> {
	const dataDir = getDataDir()
	try {
		const keyStorage = await createKeyStorage(dataDir)
		return new EncryptedFileStorageProvider(dataDir, keyStorage)
	} catch (err) {
		console.error(
			"[storage] Encrypted storage unavailable, falling back to error provider:",
			err,
		)
		return new UnavailableStorageProvider(
			err instanceof Error ? err.message : String(err),
		)
	}
}