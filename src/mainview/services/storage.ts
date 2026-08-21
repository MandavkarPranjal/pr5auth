import { Electroview } from "electrobun/view"
import type { SecureStorageSchema } from "../../shared/rpcSchema"
import {
	SETTINGS_KEY,
	StorageError,
	VAULT_KEY,
	isStorageStatusProvider,
} from "../../shared/storageProvider"
import type {
	StorageProvider,
	StorageStatus,
	StorageStatusProvider,
} from "../../shared/storageProvider"
import type { Account, AppSettings } from "../types/account"
import { deserializeVault, serializeVault } from "./accountService"

export interface StorageAdapter {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
	removeItem(key: string): void
}

const localStorageAdapter: StorageAdapter = {
	getItem: (key) => {
		try {
			return window.localStorage.getItem(key)
		} catch {
			return null
		}
	},
	setItem: (key, value) => {
		try {
			window.localStorage.setItem(key, value)
		} catch {
			// storage full / unavailable — plaintext fallback is not used
		}
	},
	removeItem: (key) => {
		try {
			window.localStorage.removeItem(key)
		} catch {
			// noop
		}
	},
};

export const DEFAULT_SETTINGS: AppSettings = {
	autoLock: true,
	minimizeToTray: false,
}

export function isSecureStorageAvailable(): boolean {
	return typeof window.__electrobun !== "undefined"
}

interface SecureStorageRpcClient {
	request: {
		"storage:getItem": (params: { key: string }) => Promise<string | null>
		"storage:setItem": (params: {
			key: string
			value: string
		}) => Promise<void>
		"storage:removeItem": (params: { key: string }) => Promise<void>
		"storage:status": () => Promise<StorageStatus>
		"storage:reset": () => Promise<void>
	}
}

function connectRpc(): SecureStorageRpcClient | null {
	if (!isSecureStorageAvailable()) return null
	const rpc = Electroview.defineRPC<SecureStorageSchema>({
		maxRequestTime: 10000,
		handlers: { requests: {}, messages: {} },
	})
	new Electroview({ rpc })
	return rpc as unknown as SecureStorageRpcClient
}

export class RpcStorageProvider implements StorageProvider, StorageStatusProvider {
	private rpc: SecureStorageRpcClient | null

	constructor() {
		this.rpc = connectRpc()
	}

	private guard(): SecureStorageRpcClient {
		if (!this.rpc) {
			throw new StorageError(
				"Encrypted storage is only available inside the PR5Auth desktop app.",
				"unavailable",
			)
		}
		return this.rpc
	}

	async getItem(key: string): Promise<string | null> {
		try {
			return await this.guard().request["storage:getItem"]({ key })
		} catch (err) {
			if (err instanceof StorageError) throw err
			throw new StorageError(
				`Encrypted storage read failed: ${(err as Error).message}`,
				"unavailable",
			)
		}
	}

	async setItem(key: string, value: string): Promise<void> {
		try {
			await this.guard().request["storage:setItem"]({ key, value })
		} catch (err) {
			if (err instanceof StorageError) throw err
			throw new StorageError(
				`Encrypted storage write failed: ${(err as Error).message}`,
				"unavailable",
			)
		}
	}

	async removeItem(key: string): Promise<void> {
		try {
			await this.guard().request["storage:removeItem"]({ key })
		} catch (err) {
			if (err instanceof StorageError) throw err
			throw new StorageError(
				`Encrypted storage remove failed: ${(err as Error).message}`,
				"unavailable",
			)
		}
	}

	async reset(): Promise<void> {
		await this.guard().request["storage:reset"]()
	}

	async getStatus(): Promise<StorageStatus> {
		return this.guard().request["storage:status"]()
	}
}

export class VaultStorage {
	private provider: StorageProvider
	private ready: Promise<void>

	constructor(provider: StorageProvider = new RpcStorageProvider()) {
		this.provider = provider
		this.ready = this.migrateLegacyData()
	}

	async loadVault(): Promise<Account[] | null> {
		await this.ready
		const raw = await this.provider.getItem(VAULT_KEY)
		if (raw === null) return null
		return deserializeVault(raw)
	}

	async saveVault(accounts: Account[]): Promise<void> {
		await this.ready
		await this.provider.setItem(VAULT_KEY, serializeVault(accounts))
	}

	async clearVault(): Promise<void> {
		await this.ready
		await this.provider.removeItem(VAULT_KEY)
	}

	async loadSettings(): Promise<AppSettings> {
		await this.ready
		const raw = await this.provider.getItem(SETTINGS_KEY)
		if (raw === null) return { ...DEFAULT_SETTINGS }
		try {
			return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
		} catch {
			return { ...DEFAULT_SETTINGS }
		}
	}

	async saveSettings(settings: AppSettings): Promise<void> {
		await this.ready
		await this.provider.setItem(SETTINGS_KEY, JSON.stringify(settings))
	}

	async reset(): Promise<void> {
		await this.ready
		await this.provider.reset()
	}

	async getStatus(): Promise<StorageStatus> {
		await this.ready
		if (isStorageStatusProvider(this.provider)) {
			return this.provider.getStatus()
		}
		return {
			platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
			kind: "unknown",
			available: false,
			detail: "Storage provider does not report status",
		}
	}

	private async migrateLegacyData(): Promise<void> {
		if (!isStorageStatusProvider(this.provider)) return

		const legacyVault = localStorageAdapter.getItem(VAULT_KEY)
		const legacySettings = localStorageAdapter.getItem(SETTINGS_KEY)

		const migrated: string[] = []
		if (legacyVault !== null) {
			const existing = await this.provider.getItem(VAULT_KEY)
			if (existing === null) {
				await this.provider.setItem(VAULT_KEY, legacyVault)
			}
			migrated.push(VAULT_KEY)
		}
		if (legacySettings !== null) {
			const existing = await this.provider.getItem(SETTINGS_KEY)
			if (existing === null) {
				await this.provider.setItem(SETTINGS_KEY, legacySettings)
			}
			migrated.push(SETTINGS_KEY)
		}

		for (const key of migrated) {
			localStorageAdapter.removeItem(key)
		}
		if (migrated.length > 0) {
			console.log(
				`[storage] Migrated ${migrated.length} legacy key(s) to encrypted storage`,
			)
		}
	}
}

export const storage = new VaultStorage()