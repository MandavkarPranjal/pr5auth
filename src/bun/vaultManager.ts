import { mkdir, readdir, readFile, writeFile, unlink, chmod } from "node:fs/promises"
import path from "node:path"
import { StorageError } from "../shared/storageProvider"
import {
	DEFAULT_ARGON2_PARAMS,
	VAULT_VERIFIER_PLAINTEXT,
	deriveKey,
	fromBase64Url,
	generateSalt,
	toBase64Url,
	type Argon2Params,
} from "../shared/vaultCrypto"
import { decrypt, encrypt } from "./secureStorage"

export interface VaultState {
	hasPassword: boolean
	isLocked: boolean
}

interface VaultMeta {
	v: 1
	salt: string // base64url
	params: Argon2Params
	verifier: string // encrypted verifier payload (AES-GCM JSON)
	createdAt: number
}

const META_FILE = "vault.meta.json"
const FILE_MODE = 0o600

function metaPath(dataDir: string): string {
	return path.join(dataDir, META_FILE)
}

export class VaultManager {
	private dataDir: string
	private key: Uint8Array | null = null
	private meta: VaultMeta | null = null
	private locked = true

	constructor(dataDir: string) {
		this.dataDir = dataDir
	}

	// Load meta from disk if exists. Called lazily.
	private async loadMeta(): Promise<VaultMeta | null> {
		if (this.meta) return this.meta
		try {
			const raw = await readFile(metaPath(this.dataDir), "utf8")
			const parsed = JSON.parse(raw) as VaultMeta
			if (parsed?.v !== 1 || typeof parsed.salt !== "string" || typeof parsed.verifier !== "string") {
				throw new Error("Invalid vault meta")
			}
			this.meta = parsed
			return parsed
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
			// Corrupt meta -> treat as unavailable
			throw new StorageError(`Vault meta is corrupt: ${(err as Error).message}`, "corrupt")
		}
	}

	private async saveMeta(meta: VaultMeta): Promise<void> {
		await mkdir(this.dataDir, { recursive: true })
		const tmp = `${metaPath(this.dataDir)}.${Math.random().toString(36).slice(2)}.tmp`
		await writeFile(tmp, JSON.stringify(meta), { mode: FILE_MODE })
		await chmod(tmp, FILE_MODE)
		const { rename } = await import("node:fs/promises")
		await rename(tmp, metaPath(this.dataDir))
		this.meta = meta
	}

	async getStatus(): Promise<VaultState> {
		const meta = await this.loadMeta()
		return {
			hasPassword: meta !== null,
			isLocked: meta === null ? false : this.locked || this.key === null,
		}
	}

	hasPasswordSync(): boolean {
		return this.meta !== null
	}

	isLockedSync(): boolean {
		if (!this.meta) return false
		return this.locked || this.key === null
	}

	async createMasterPassword(password: string, params: Argon2Params = DEFAULT_ARGON2_PARAMS, fallbackKey?: Uint8Array): Promise<void> {
		if (!password || password.length < 8) {
			throw new StorageError("Master password must be at least 8 characters", "denied")
		}
		const existing = await this.loadMeta()
		if (existing) {
			throw new StorageError("Master password already exists. Use change or reset.", "denied")
		}
		const salt = generateSalt()
		const key = deriveKey(password, salt, params)
		const verifier = encrypt(VAULT_VERIFIER_PLAINTEXT, key)
		const meta: VaultMeta = {
			v: 1,
			salt: toBase64Url(salt),
			params,
			verifier,
			createdAt: Date.now(),
		}
		if (fallbackKey) {
			await this.migrateVaultData(fallbackKey, key)
		} else {
			// When the OS key backend is unavailable we have no source key to
			// migrate from. If legacy `.enc` files already exist, creating a
			// password without migrating would switch all future reads to the
			// new Argon2 key while ciphertext remains encrypted with the old
			// OS key, making vault data permanently unrecoverable. Refuse in
			// that state — caller must recover the original key or reset.
			const isEnoent = (err: unknown): boolean => (err as NodeJS.ErrnoException).code === "ENOENT"
			let hasLegacyFiles = false
			try {
				const entries = await readdir(this.dataDir)
				hasLegacyFiles = entries.some((entry) => entry.endsWith(".enc"))
			} catch (err) {
				if (!isEnoent(err)) throw err
			}
			if (hasLegacyFiles) {
				throw new StorageError(
					"Cannot create master password: encrypted vault data exists but the OS key backend is unavailable. Recover the original key or reset the vault before setting a password.",
					"unavailable",
				)
			}
		}
		await this.saveMeta(meta)
		this.key = key
		this.locked = false
		this.secureClear(password)
	}

	async unlock(password: string): Promise<void> {
		const meta = await this.loadMeta()
		if (!meta) {
			throw new StorageError("No master password set. Create one first.", "denied")
		}
		if (!password) throw new StorageError("Password required", "denied")
		const salt = fromBase64Url(meta.salt)
		let key: Uint8Array
		try {
			key = deriveKey(password, salt, meta.params)
		} catch (err) {
			throw new StorageError(`Key derivation failed: ${(err as Error).message}`, "unrecoverable")
		}
		// Verify password by decrypting verifier
		try {
			const plain = decrypt(meta.verifier, key)
			if (plain !== VAULT_VERIFIER_PLAINTEXT) {
				throw new Error("Verifier mismatch")
			}
		} catch {
			throw new StorageError("Invalid master password", "denied")
		}
		this.key = key
		this.locked = false
		this.secureClear(password)
	}

	lock(): void {
		if (this.key) {
			// Best-effort zeroing
			this.key.fill(0)
		}
		this.key = null
		this.locked = true
	}

	// Change password – re-encrypt verifier and keep same key derivation flow
	async changePassword(oldPassword: string, newPassword: string): Promise<void> {
		if (!newPassword || newPassword.length < 8) {
			throw new StorageError("New password must be at least 8 characters", "denied")
		}
		const meta = await this.loadMeta()
		if (!meta) throw new StorageError("No master password set", "denied")
		// Verify old
		await this.unlock(oldPassword)
		// Derive new
		const newSalt = generateSalt()
		const newKey = deriveKey(newPassword, newSalt, meta.params)
		const newVerifier = encrypt(VAULT_VERIFIER_PLAINTEXT, newKey)
		const newMeta: VaultMeta = {
			v: 1,
			salt: toBase64Url(newSalt),
			params: meta.params,
			verifier: newVerifier,
			createdAt: meta.createdAt,
		}
		// TODO: Caller should re-encrypt vault data with newKey vs old key.
		// For now just rotate meta and key; vault data re-encryption is handled at a higher layer
		// by decrypting with old key and encrypting with new. We expose both keys via return?
		// Simpler: update meta and key; vault data migration will be attempted by storage layer
		// if we provide a hook. For now store old key temporarily inside change flow?
		// To keep correct, we need to re-encrypt existing vault files here if they exist.
		// Attempt to migrate vault files transparently.
		// Snapshot old key immutably so a concurrent lock() that zeroes
		// this.key does not corrupt the migration source.
		const oldKey = new Uint8Array(this.key!)
		// Actually this.key currently holds old key after unlock. We now have newKey.
		// Migrate any existing .enc files that were encrypted with oldKey?
		// But EncryptedFileStorageProvider currently uses VaultManager key only, not OS key.
		// If we just swap keys, old vault data becomes unreadable. So we must re-encrypt.
		await this.migrateVaultData(oldKey, newKey)
		await this.saveMeta(newMeta)
		this.key = newKey
		this.locked = false
		oldKey.fill(0)
		this.secureClear(oldPassword)
		this.secureClear(newPassword)
	}

	private async migrateVaultData(oldKey: Uint8Array, newKey: Uint8Array): Promise<void> {
		const { readdir, readFile, writeFile } = await import("node:fs/promises")
		const isEnoent = (err: unknown): boolean => (err as NodeJS.ErrnoException).code === "ENOENT"
		let entries: string[]
		try {
			entries = await readdir(this.dataDir)
		} catch (err) {
			if (isEnoent(err)) return
			throw new StorageError(`Vault migration failed to list vault: ${(err as Error).message}`, "io")
		}
		const encEntries = entries.filter((entry) => entry.endsWith(".enc"))
		if (encEntries.length === 0) return

		// Phase 1: verify every .enc file is decryptable with oldKey and prepare
		// re-encrypted payloads. We do not write anything until all files are
		// verified so a single skipped/lost file does not orphan data after the
		// meta swap (old password would no longer match new salt).
		const pending: { full: string; tmp: string; payload: string }[] = []
		for (const entry of encEntries) {
			const full = path.join(this.dataDir, entry)
			let raw: string
			try {
				raw = await readFile(full, "utf8")
			} catch (err) {
				if (isEnoent(err)) continue
				throw new StorageError(`Vault migration failed to read ${entry}: ${(err as Error).message}`, "io")
			}
			let plaintext: string
			try {
				plaintext = decrypt(raw, oldKey)
			} catch (err) {
				throw new StorageError(
					`Vault migration failed for ${entry}: ${(err as Error).message} — file not decryptable with current key, aborting to avoid orphaning data`,
					"unrecoverable",
				)
			}
			const reEncrypted = encrypt(plaintext, newKey)
			const tmp = `${full}.${Math.random().toString(36).slice(2)}.tmp`
			pending.push({ full, tmp, payload: reEncrypted })
		}

		// Phase 2: write all re-encrypted payloads to temp files. No renames yet,
		// so a crash here leaves original .enc files untouched.
		try {
			for (const item of pending) {
				await writeFile(item.tmp, item.payload, { mode: FILE_MODE })
				await chmod(item.tmp, FILE_MODE)
			}
		} catch (err) {
			await Promise.all(pending.map((p) => unlink(p.tmp).catch(() => {})))
			throw new StorageError(`Vault migration failed to stage re-encrypted files: ${(err as Error).message}`, "io")
		}

		// Phase 3: atomically replace each .enc file. Only after every rename
		// succeeds do we consider migration complete; callers must not swap
		// meta/keys before this point.
		try {
			const { rename } = await import("node:fs/promises")
			for (const item of pending) {
				await rename(item.tmp, item.full)
			}
		} catch (err) {
			await Promise.all(pending.map((p) => unlink(p.tmp).catch(() => {})))
			throw new StorageError(`Vault migration failed to commit re-encrypted files: ${(err as Error).message}`, "io")
		}
	}

	async reset(): Promise<void> {
		// Delete encrypted files first and only remove metadata after the vault
		// data has been cleared. If files deletion fails we keep the metadata
		// so the remaining .enc files stay decryptable (recoverable). If we
		// removed metadata first, a subsequent I/O failure would orphan the
		// encrypted files without their salt/params and cause permanent loss.
		let hadMeta = false
		try {
			await readFile(metaPath(this.dataDir), "utf8")
			hadMeta = true
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
				throw new StorageError(`Could not read vault metadata: ${(err as Error).message}`, "io")
			}
		}

		const isEnoent = (err: unknown): boolean => (err as NodeJS.ErrnoException).code === "ENOENT"

		try {
			let entries: string[]
			try {
				entries = await readdir(this.dataDir)
			} catch (err) {
				if (!isEnoent(err)) throw err
				entries = []
			}
			await Promise.all(
				entries
					.filter((entry) => entry.endsWith(".enc"))
					.map(async (entry) => {
						try {
							await unlink(path.join(this.dataDir, entry))
						} catch (err) {
							if (!isEnoent(err)) throw err
						}
					}),
			)
		} catch (err) {
			if (err instanceof StorageError) throw err
			throw new StorageError(`Could not reset vault: ${(err as Error).message}`, "io")
		}

		if (hadMeta) {
			try {
				await unlink(metaPath(this.dataDir))
			} catch (err) {
				if (!isEnoent(err)) {
					throw new StorageError(`Could not reset vault metadata: ${(err as Error).message}`, "io")
				}
			}
		}

		this.meta = null
		this.lock()
	}

	getKey(): Uint8Array {
		if (!this.meta) {
			throw new StorageError("Master password not set", "unavailable")
		}
		if (this.locked || !this.key) {
			throw new StorageError("Vault is locked. Unlock with master password.", "denied")
		}
		// Return a copy so a concurrent lock() that zeroes the internal key
		// does not mutate an in-flight storage write that already captured it.
		return new Uint8Array(this.key)
	}

	// Expose for testing / params inspection
	async getMetaForTest(): Promise<VaultMeta | null> {
		return this.loadMeta()
	}

	private secureClear(_s: string): void {
		// JS strings are immutable; we cannot truly clear them, but we avoid retaining references.
		// Explicitly hint GC by dropping references.
	}
}
