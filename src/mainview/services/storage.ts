import type { Account, AppSettings } from "../types/account";

export interface StorageAdapter {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export const localStorageAdapter: StorageAdapter = {
	getItem: (key) => {
		try {
			return window.localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	setItem: (key, value) => {
		try {
			window.localStorage.setItem(key, value);
		} catch {
			// storage full / unavailable — prototype tolerates this
		}
	},
	removeItem: (key) => {
		try {
			window.localStorage.removeItem(key);
		} catch {
			// noop
		}
	},
};

const VAULT_KEY = "pr5auth.vault.v1";
const SETTINGS_KEY = "pr5auth.settings.v1";
const VAULT_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
	autoLock: true,
	minimizeToTray: false,
};

/**
 * Storage abstraction layer.
 *
 * Every read/write is async so the adapter can later be swapped for
 * file-based or OS-keychain backed storage without touching callers.
 */
export class VaultStorage {
	private adapter: StorageAdapter;

	constructor(adapter: StorageAdapter = localStorageAdapter) {
		this.adapter = adapter;
	}

	async loadVault(): Promise<Account[] | null> {
		const raw = this.adapter.getItem(VAULT_KEY);
		if (raw === null) return null;
		try {
			const parsed = JSON.parse(raw);
			if (parsed?.version !== VAULT_SCHEMA_VERSION || !Array.isArray(parsed.accounts)) {
				return null;
			}
			return parsed.accounts as Account[];
		} catch {
			return null;
		}
	}

	async saveVault(accounts: Account[]): Promise<void> {
		const payload = JSON.stringify({
			version: VAULT_SCHEMA_VERSION,
			exportedAt: new Date().toISOString(),
			accounts,
		});
		this.adapter.setItem(VAULT_KEY, payload);
	}

	async clearVault(): Promise<void> {
		this.adapter.removeItem(VAULT_KEY);
	}

	async loadSettings(): Promise<AppSettings> {
		const raw = this.adapter.getItem(SETTINGS_KEY);
		if (raw === null) return { ...DEFAULT_SETTINGS };
		try {
			return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	}

	async saveSettings(settings: AppSettings): Promise<void> {
		this.adapter.setItem(SETTINGS_KEY, JSON.stringify(settings));
	}
}

export const storage = new VaultStorage();
