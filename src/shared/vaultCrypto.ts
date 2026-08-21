import { argon2id } from "@noble/hashes/argon2.js"

export const VAULT_SALT_BYTES = 16
export const VAULT_KEY_BYTES = 32
export const VAULT_VERIFIER_PLAINTEXT = "pr5auth-vault-verifier-v1"

// OWASP / RFC 9106 guidance – tune for desktop.
// m = 64 MiB, t = 3, p = 1 is a strong default; tests may use lower m.
export interface Argon2Params {
	t: number
	m: number
	p: number
}

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
	t: 3,
	m: 64 * 1024, // KiB
	p: 1,
}

export function deriveKey(
	password: string,
	salt: Uint8Array,
	params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Uint8Array {
	if (!password) throw new Error("Password must not be empty")
	if (salt.length < 8) throw new Error("Salt too short")
	return argon2id(password, salt, {
		t: params.t,
		m: params.m,
		p: params.p,
		dkLen: VAULT_KEY_BYTES,
	})
}

export function deriveKeyAsync(
	password: string,
	salt: Uint8Array,
	params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<Uint8Array> {
	// Wrap sync variant for callers that prefer async; noble also offers argon2idAsync
	// but sync is acceptable for our key size and avoids scheduler overhead in tests.
	return Promise.resolve(deriveKey(password, salt, params))
}

export function generateSalt(bytes = VAULT_SALT_BYTES): Uint8Array {
	const out = new Uint8Array(bytes)
	if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
		globalThis.crypto.getRandomValues(out)
		return out
	}
	// Node fallback – will be tree-shaken in browser builds
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const nodeCrypto = eval("require")("node:crypto") as typeof import("node:crypto")
	return new Uint8Array(nodeCrypto.randomBytes(bytes))
}

export function toBase64Url(buf: Uint8Array): string {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(buf).toString("base64url")
	}
	// Browser fallback
	let binary = ""
	for (const b of buf) binary += String.fromCharCode(b)
	const base64 = btoa(binary)
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function fromBase64Url(v: string): Uint8Array {
	if (typeof Buffer !== "undefined") {
		return new Uint8Array(Buffer.from(v, "base64url"))
	}
	let base64 = v.replace(/-/g, "+").replace(/_/g, "/")
	while (base64.length % 4) base64 += "="
	const binary = atob(base64)
	const out = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
	return out
}
