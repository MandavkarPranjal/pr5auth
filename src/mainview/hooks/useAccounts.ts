import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, AddAccountInput } from "../types/account";
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
	addAccount: (input: AddAccountInput) => Promise<void>;
	deleteAccount: (id: string) => Promise<void>;
	importVault: (json: string) => Promise<number>;
	replaceAll: (accounts: Account[]) => Promise<void>;
}

export function useAccounts(): UseAccountsResult {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [loading, setLoading] = useState(true);
	const accountsRef = useRef<Account[]>([]);

	useEffect(() => {
		let cancelled = false;

		async function hydrate() {
			const stored = await storage.loadVault();
			if (cancelled) return;

			let next: Account[];
			if (stored === null) {
				next = createMockAccounts();
				await storage.saveVault(next);
			} else {
				next = stored;
			}
			accountsRef.current = next;
			setAccounts(next);
			setLoading(false);
		}

		void hydrate();
		return () => {
			cancelled = true;
		};
	}, []);

	const addAccount = useCallback(async (input: AddAccountInput) => {
		const updated = addAccountToStore(accountsRef.current, input);
		accountsRef.current = updated;
		setAccounts(updated);
		await storage.saveVault(updated);
	}, []);

	const deleteAccount = useCallback(async (id: string) => {
		const updated = deleteAccountFromStore(accountsRef.current, id);
		accountsRef.current = updated;
		setAccounts(updated);
		await storage.saveVault(updated);
	}, []);

	const importVault = useCallback(async (json: string) => {
		const imported = parseVaultImport(json);
		if (imported.length === 0) throw new Error("No accounts found in vault");
		accountsRef.current = imported;
		setAccounts(imported);
		await storage.saveVault(imported);
		return imported.length;
	}, []);

	const replaceAll = useCallback(async (next: Account[]) => {
		accountsRef.current = next;
		setAccounts(next);
		await storage.saveVault(next);
	}, []);

	return { accounts, loading, addAccount, deleteAccount, importVault, replaceAll };
}
