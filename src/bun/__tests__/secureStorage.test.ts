import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { StorageError, VAULT_KEY } from "../../shared/storageProvider"
import type { KeyStorage } from "../keychain"
import {
	EncryptedFileStorageProvider,
	decrypt,
	encrypt,
	getDataDir,
} from "../secureStorage"

const tmpDirs: string[] = []

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "pr5auth-test-"))
	tmpDirs.push(dir)
	return dir
}

afterEach(async () => {
	await Promise.all(
		tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	)
})

class TestKeyStorage implements KeyStorage {
	readonly kind = "file-encrypted" as const
	readonly detail = "test key"
	async getKey(): Promise<Uint8Array> {
		return new Uint8Array(32).fill(7)
	}
}

describe("encrypt / decrypt", () => {
	it("round-trips a value", () => {
		const key = new Uint8Array(32).fill(1)
		const payload = encrypt("hello secret", key)
		expect(decrypt(payload, key)).toBe("hello secret")
	})

	it("produces unique ciphertext for identical input", () => {
		const key = new Uint8Array(32).fill(1)
		expect(encrypt("same", key)).not.toBe(encrypt("same", key))
	})

	it("throws StorageError on a corrupt payload", () => {
		const key = new Uint8Array(32).fill(1)
		const corrupt = () => decrypt("not-json", key)
		expect(corrupt).toThrow(StorageError)
		expect(corrupt).toThrow(/not valid JSON/i)
		expect(() => {
			try {
				decrypt("not-json", key)
			} catch (err) {
				if (err instanceof StorageError) throw new Error(err.code)
			}
		}).toThrow("corrupt")
	})

	it("throws StorageError when the wrong key is used", () => {
		const key = new Uint8Array(32).fill(1)
		const other = new Uint8Array(32).fill(2)
		const payload = encrypt("secret", key)
		expect(() => decrypt(payload, other)).toThrow(StorageError)
	})
})

describe("EncryptedFileStorageProvider", () => {
	it("returns null for a missing key", async () => {
		const dir = await makeTempDir()
		const provider = new EncryptedFileStorageProvider(dir, new TestKeyStorage())
		expect(await provider.getItem("missing")).toBeNull()
	})

	it("stores and reads a value", async () => {
		const dir = await makeTempDir()
		const provider = new EncryptedFileStorageProvider(dir, new TestKeyStorage())
		await provider.setItem(VAULT_KEY, "vault-data")
		expect(await provider.getItem(VAULT_KEY)).toBe("vault-data")
		const files = await readdir(dir)
		expect(files).toHaveLength(1)
		expect(files[0]).toEndWith(".enc")
	})

	it("never writes plaintext to disk", async () => {
		const dir = await makeTempDir()
		const provider = new EncryptedFileStorageProvider(dir, new TestKeyStorage())
		await provider.setItem(VAULT_KEY, "super-secret-value")
		const files = await readdir(dir)
		const raw = await readFile(path.join(dir, files[0]), "utf8")
		expect(raw).not.toContain("super-secret-value")
		expect(raw).not.toContain("pr5auth.vault")
	})

	it("reports corruption as StorageError", async () => {
		const dir = await makeTempDir()
		const provider = new EncryptedFileStorageProvider(dir, new TestKeyStorage())
		await provider.setItem(VAULT_KEY, "data")
		const files = await readdir(dir)
		await writeFile(path.join(dir, files[0]), "garbage", "utf8")
		expect(provider.getItem(VAULT_KEY)).rejects.toThrow(StorageError)
	})

	it("removes an item", async () => {
		const dir = await makeTempDir()
		const provider = new EncryptedFileStorageProvider(dir, new TestKeyStorage())
		await provider.setItem(VAULT_KEY, "data")
		await provider.removeItem(VAULT_KEY)
		expect(await provider.getItem(VAULT_KEY)).toBeNull()
	})

	it("reset clears all encrypted files", async () => {
		const dir = await makeTempDir()
		const provider = new EncryptedFileStorageProvider(dir, new TestKeyStorage())
		await provider.setItem("a", "1")
		await provider.setItem("b", "2")
		await provider.reset()
		expect(await readdir(dir)).toHaveLength(0)
	})
})

describe("getDataDir", () => {
	it("honors the PR5AUTH_DATA_DIR override", () => {
		const prev = process.env.PR5AUTH_DATA_DIR
		process.env.PR5AUTH_DATA_DIR = "/tmp/pr5auth-data-dir"
		try {
			expect(getDataDir()).toBe("/tmp/pr5auth-data-dir")
		} finally {
			if (prev === undefined) delete process.env.PR5AUTH_DATA_DIR
			else process.env.PR5AUTH_DATA_DIR = prev
		}
	})
})