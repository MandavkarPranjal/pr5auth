import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, AddAccountInput } from "../types/account";
import type { StorageStatus } from "../../shared/storageProvider";
import {
	addAccount as addAccountToStore,
	deleteAccount as deleteAccountFromStore,
	parseVaultImport,
} from "../services/accountService";
import { storage } from "../services/storage";
import { createMockAccounts } from "../services/mockData";

export interface UseAccountsResult {
	accounts: Account[];
	loading: boolean;
	error: string | null;
	storageStatus: StorageStatus | null;
	addAccount: (input: AddAccountInput) => Promise<void>;
	deleteAccount: (id: string) => Promise<void>;
	importVault: (json: string) => Promise<number>;
	replaceAll: (accounts: Account[]) => Promise<void>;
	resetVault: () => Promise<void>;
	clearError: () => void;
}

function toErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export function useAccounts(): UseAccountsResult {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
	const accountsRef = useRef<Account[]>([]);

	const persist = useCallback(async (next: Account[]) => {
		accountsRef.current = next;
		setAccounts(next);
		try {
			await storage.saveVault(next);
			setError(null);
		} catch (err) {
			const message = toErrorMessage(err);
			setError(message);
			throw err;
		}
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function hydrate() {
			try {
				const status = await storage.getStatus();
				if (!cancelled) setStorageStatus(status);
			} catch {
				if (!cancelled) setStorageStatus(null);
			}

			try {
				const stored = await storage.loadVault();
				if (cancelled) return;

				let next: Account[];
				if (stored === null) {
					next = createMockAccounts();
					await persist(next);
				} else {
					next = stored;
					accountsRef.current = next;
					setAccounts(next);
				}
			} catch (err) {
				if (!cancelled) setError(toErrorMessage(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		void hydrate();
		return () => {
			cancelled = true;
		};
	}, [persist]);

	const addAccount = useCallback(
		async (input: AddAccountInput) => {
			const updated = addAccountToStore(accountsRef.current, input);
			await persist(updated);
		},
		[persist],
	);

	const deleteAccount = useCallback(
		async (id: string) => {
			const updated = deleteAccountFromStore(accountsRef.current, id);
			await persist(updated);
		},
		[persist],
	);

	const importVault = useCallback(
		async (json: string) => {
			const imported = parseVaultImport(json);
			if (imported.length === 0) throw new Error("No accounts found in vault");
			await persist(imported);
			return imported.length;
		},
		[persist],
	);

	const replaceAll = useCallback(
		async (next: Account[]) => {
			await persist(next);
		},
		[persist],
	);

	const resetVault = useCallback(async () => {
		try {
			await storage.clearVault();
		} catch (err) {
			setError(toErrorMessage(err));
			throw err;
		}
		await persist(createMockAccounts());
	}, [persist]);

	const clearError = useCallback(() => setError(null), []);

	return {
		accounts,
		loading,
		error,
		storageStatus,
		addAccount,
		deleteAccount,
		importVault,
		replaceAll,
		resetVault,
		clearError,
	};
}