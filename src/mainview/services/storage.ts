import { Electroview } from "electrobun/view"
import type { SecureStorageSchema, VaultStatus } from "../../shared/rpcSchema"
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
	closeToTray: false,
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
		"tray:updateCount": (params: { count: number }) => Promise<void>
		"tray:updateSettings": (params: {
			minimizeToTray: boolean
			closeToTray: boolean
		}) => Promise<void>
		"vault:status": () => Promise<VaultStatus>
		"vault:createPassword": (params: { password: string }) => Promise<void>
		"vault:unlock": (params: { password: string }) => Promise<void>
		"vault:lock": () => Promise<void>
		"vault:changePassword": (params: {
			oldPassword: string
			newPassword: string
		}) => Promise<void>
		"vault:reset": () => Promise<void>
	}
}

let sharedRpc: SecureStorageRpcClient | null | undefined

function connectRpc(): SecureStorageRpcClient | null {
	if (sharedRpc !== undefined) return sharedRpc
	if (!isSecureStorageAvailable()) {
		sharedRpc = null
		return sharedRpc
	}
	const rpc = Electroview.defineRPC<SecureStorageSchema>({
		maxRequestTime: 30000,
		handlers: {
			requests: {},
			messages: {
				"tray:lock": () => {
					window.dispatchEvent(new CustomEvent("pr5auth:lock"))
				},
				"updater:progress": (payload) => {
					// Forward Electrobun Updater progress to the isolated updateService via window event.
					// This avoids creating a second Electroview (which would overwrite receiveMessageFromBun).
					window.dispatchEvent(new CustomEvent("pr5auth:updater-progress", { detail: payload }))
				},
			},
		},
	})
	new Electroview({ rpc })
	sharedRpc = rpc as unknown as SecureStorageRpcClient
	return sharedRpc
}

/** Generic RPC accessor for updater – typed via augmentation */
export function getUpdaterRpc(): {
	request: {
		"updater:check": (params: { force?: boolean }) => Promise<import("../../shared/rpcSchema").UpdateCheckResult>
		"updater:download": () => Promise<import("../../shared/rpcSchema").UpdateCheckResult>
		"updater:apply": () => Promise<void>
		"updater:getState": () => Promise<import("../../shared/rpcSchema").UpdateStatePayload>
	}
} | null {
	const rpc = connectRpc() as unknown as {
		request: {
			"updater:check": (params: { force?: boolean }) => Promise<import("../../shared/rpcSchema").UpdateCheckResult>
			"updater:download": () => Promise<import("../../shared/rpcSchema").UpdateCheckResult>
			"updater:apply": () => Promise<void>
			"updater:getState": () => Promise<import("../../shared/rpcSchema").UpdateStatePayload>
		}
	} | null
	return rpc as unknown as ReturnType<typeof getUpdaterRpc>
}

export function getTrayRpc(): SecureStorageRpcClient | null {
	return connectRpc()
}

export async function notifyTrayCount(count: number): Promise<void> {
	const rpc = connectRpc()
	if (!rpc) return
	try {
		await rpc.request["tray:updateCount"]({ count })
	} catch {
		// ignore — tray may not be available outside desktop app
	}
}

export async function notifyTraySettings(settings: AppSettings): Promise<void> {
	const rpc = connectRpc()
	if (!rpc) return
	try {
		await rpc.request["tray:updateSettings"]({
			minimizeToTray: settings.minimizeToTray,
			closeToTray: settings.closeToTray,
		})
	} catch {
		// ignore
	}
}

// ─── Vault lock / master password API ───────────────────────────────────────

export async function getVaultStatus(): Promise<VaultStatus | null> {
	const rpc = connectRpc()
	if (!rpc) return null
	return rpc.request["vault:status"]()
}

export async function createMasterPassword(password: string): Promise<void> {
	const rpc = connectRpc()
	if (!rpc) throw new StorageError("Vault unavailable outside desktop app", "unavailable")
	await rpc.request["vault:createPassword"]({ password })
}

export async function unlockVault(password: string): Promise<void> {
	const rpc = connectRpc()
	if (!rpc) throw new StorageError("Vault unavailable outside desktop app", "unavailable")
	await rpc.request["vault:unlock"]({ password })
}

export async function lockVault(): Promise<void> {
	const rpc = connectRpc()
	if (!rpc) return
	await rpc.request["vault:lock"]()
}

export async function changeVaultPassword(oldPassword: string, newPassword: string): Promise<void> {
	const rpc = connectRpc()
	if (!rpc) throw new StorageError("Vault unavailable outside desktop app", "unavailable")
	await rpc.request["vault:changePassword"]({ oldPassword, newPassword })
}

export async function resetVaultWithPassword(): Promise<void> {
	const rpc = connectRpc()
	if (!rpc) throw new StorageError("Vault unavailable outside desktop app", "unavailable")
	await rpc.request["vault:reset"]()
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
	private pendingLegacy: { vault: string | null; settings: string | null } | null = null

	constructor(provider: StorageProvider = new RpcStorageProvider()) {
		this.provider = provider
		this.ready = this.migrateLegacyData()
	}

	async loadVault(): Promise<Account[] | null> {
		await this.ready
		await this.ensureLegacyMigrated()
		const raw = await this.provider.getItem(VAULT_KEY)
		if (raw === null) return null
		return deserializeVault(raw)
	}

	async saveVault(accounts: Account[]): Promise<void> {
		await this.ready
		await this.ensureLegacyMigrated()
		await this.provider.setItem(VAULT_KEY, serializeVault(accounts))
	}

	async clearVault(): Promise<void> {
		await this.ready
		await this.ensureLegacyMigrated()
		await this.provider.removeItem(VAULT_KEY)
	}

	async loadSettings(): Promise<AppSettings> {
		await this.ready
		await this.ensureLegacyMigrated()
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
		await this.ensureLegacyMigrated()
		await this.provider.setItem(SETTINGS_KEY, JSON.stringify(settings))
	}

	async reset(): Promise<void> {
		await this.ready
		await this.ensureLegacyMigrated()
		await this.provider.reset()
	}

	async getStatus(): Promise<StorageStatus> {
		await this.ready
		await this.ensureLegacyMigrated()
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

	private isRecoverableMigrationError(err: unknown): boolean {
		return (
			err instanceof StorageError &&
			(err.code === "unavailable" || err.code === "denied")
		)
	}

	private async ensureLegacyMigrated(): Promise<void> {
		if (!this.pendingLegacy) return
		if (!isStorageStatusProvider(this.provider)) return
		// Only retry when encrypted storage is actually available (e.g. after
		// a master password is created when the OS key backend is missing).
		try {
			const status = await this.provider.getStatus()
			if (!status.available) return
		} catch {
			return
		}
		const { vault, settings } = this.pendingLegacy
		try {
			await this.performLegacyMigration(vault, settings)
			this.pendingLegacy = null
		} catch (err) {
			if (this.isRecoverableMigrationError(err)) return
			throw err
		}
	}

	private async performLegacyMigration(
		legacyVault: string | null,
		legacySettings: string | null,
	): Promise<void> {
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

	private async migrateLegacyData(): Promise<void> {
		if (!isStorageStatusProvider(this.provider)) return

		const legacyVault = localStorageAdapter.getItem(VAULT_KEY)
		const legacySettings = localStorageAdapter.getItem(SETTINGS_KEY)
		if (legacyVault === null && legacySettings === null) return

		// If encrypted storage is not yet available (e.g. new install without
		// an OS key backend and before a vault password is created), defer the
		// one-time localStorage migration and retry after the vault becomes
		// available. Without this, the rejected `ready` promise is retained by
		// VaultStorage and the React reload after password creation cannot
		// restore storage.
		try {
			const status = await this.provider.getStatus()
			if (!status.available) {
				this.pendingLegacy = { vault: legacyVault, settings: legacySettings }
				return
			}
		} catch (err) {
			if (this.isRecoverableMigrationError(err)) {
				this.pendingLegacy = { vault: legacyVault, settings: legacySettings }
				return
			}
			throw err
		}

		try {
			await this.performLegacyMigration(legacyVault, legacySettings)
		} catch (err) {
			if (this.isRecoverableMigrationError(err)) {
				this.pendingLegacy = { vault: legacyVault, settings: legacySettings }
				return
			}
			throw err
		}
	}
}

export const storage = new VaultStorage()