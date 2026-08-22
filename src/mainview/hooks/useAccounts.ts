import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, AddAccountInput } from "../types/account";
import type { StorageStatus } from "../../shared/storageProvider";
import {
	addAccount as addAccountToStore,
	deleteAccount as deleteAccountFromStore,
	parseVaultImport,
	parseJsonImport,
	parseOtpauthBatch,
	createAccountsFromParsed,
	detectDuplicates,
	planMigration,
	applyMigration,
	buildImportPreview,
	buildJsonImportPreview,
	buildOtpauthImportPreview,
	type ImportStrategy,
	type ImportPreview,
	type MigrationPlan,
} from "../services/accountService";
import {
	storage,
	resetVaultWithPassword,
	isSecureStorageAvailable,
} from "../services/storage";
import { createMockAccounts } from "../services/mockData";

export interface UseAccountsResult {
	accounts: Account[];
	loading: boolean;
	error: string | null;
	storageStatus: StorageStatus | null;
	addAccount: (input: AddAccountInput) => Promise<void>;
	deleteAccount: (id: string) => Promise<void>;
	importVault: (json: string) => Promise<number>;
	importJson: (json: string, strategy?: ImportStrategy) => Promise<MigrationPlan & { imported: number }>;
	importOtpauth: (input: string, strategy?: ImportStrategy) => Promise<MigrationPlan & { imported: number }>;
	importAccounts: (accountsToImport: Account[], strategy?: ImportStrategy) => Promise<MigrationPlan & { imported: number }>;
	previewJsonImport: (json: string) => ImportPreview;
	previewOtpauthImport: (input: string) => ImportPreview;
	detectDuplicatesFor: (candidates: Account[]) => { duplicates: Account[]; uniques: Account[] };
	replaceAll: (accounts: Account[]) => Promise<void>;
	resetVault: () => Promise<void>;
	clearError: () => void;
	reload: () => void;
}

function toErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export function useAccounts(): UseAccountsResult {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
	const [reloadToken, setReloadToken] = useState(0);
	const accountsRef = useRef<Account[]>([]);
	const mutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());

	const enqueue = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
		const next = mutationQueueRef.current.then(task, task) as Promise<T>;
		mutationQueueRef.current = next.catch(() => {}) as Promise<unknown>;
		return next;
	}, []);

	const persist = useCallback(async (next: Account[], isStale?: () => boolean) => {
		if (isStale?.()) return;
		try {
			await storage.saveVault(next);
		} catch (err) {
			if (isStale?.()) return;
			const message = toErrorMessage(err);
			setError(message);
			throw err;
		}
		if (isStale?.()) return;
		accountsRef.current = next;
		setAccounts(next);
		setError(null);
	}, []);

	const reload = useCallback(() => {
		setLoading(true);
		setError(null);
		setReloadToken((t) => t + 1);
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
					if (cancelled) return;
					await persist(next, () => cancelled);
					if (cancelled) return;
				} else {
					next = stored;
					accountsRef.current = next;
					setAccounts(next);
					setError(null);
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
	}, [persist, reloadToken]);

	const addAccount = useCallback(
		(input: AddAccountInput) => {
			return enqueue(async () => {
				const updated = addAccountToStore(accountsRef.current, input);
				await persist(updated);
			});
		},
		[persist, enqueue],
	);

	const deleteAccount = useCallback(
		(id: string) => {
			return enqueue(async () => {
				const updated = deleteAccountFromStore(accountsRef.current, id);
				await persist(updated);
			});
		},
		[persist, enqueue],
	);

	const importVault = useCallback(
		(json: string) => {
			return enqueue(async () => {
				const imported = parseVaultImport(json);
				if (imported.length === 0) throw new Error("No accounts found in vault");
				await persist(imported);
				return imported.length;
			});
		},
		[persist, enqueue],
	);

	const importJson = useCallback(
		(json: string, strategy: ImportStrategy = "merge") => {
			return enqueue(async () => {
				const { accounts: imported } = parseJsonImport(json);
				if (imported.length === 0) throw new Error("No accounts found in vault");
				const plan = planMigration(accountsRef.current, imported, strategy);
				const next = applyMigration(accountsRef.current, imported, strategy);
				await persist(next);
				return { ...plan, imported: plan.uniques.length };
			});
		},
		[persist, enqueue],
	);

	const importOtpauth = useCallback(
		(input: string, strategy: ImportStrategy = "merge") => {
			return enqueue(async () => {
				const { parsed, errors } = parseOtpauthBatch(input);
				if (parsed.length === 0) {
					const reason = errors[0]?.reason ?? "No valid otpauth entries found";
					throw new Error(reason);
				}
				const imported = createAccountsFromParsed(parsed);
				const plan = planMigration(accountsRef.current, imported, strategy);
				const next = applyMigration(accountsRef.current, imported, strategy);
				await persist(next);
				return { ...plan, imported: plan.uniques.length };
			});
		},
		[persist, enqueue],
	);

	const importAccounts = useCallback(
		(accountsToImport: Account[], strategy: ImportStrategy = "merge") => {
			return enqueue(async () => {
				if (accountsToImport.length === 0) throw new Error("No accounts to import");
				const plan = planMigration(accountsRef.current, accountsToImport, strategy);
				const next = applyMigration(accountsRef.current, accountsToImport, strategy);
				await persist(next);
				return { ...plan, imported: plan.uniques.length };
			});
		},
		[persist, enqueue],
	);

	const previewJsonImport = useCallback(
		(json: string): ImportPreview => {
			return buildJsonImportPreview(accountsRef.current, json);
		},
		[],
	);

	const previewOtpauthImport = useCallback(
		(input: string): ImportPreview => {
			return buildOtpauthImportPreview(accountsRef.current, input);
		},
		[],
	);

	const detectDuplicatesFor = useCallback(
		(candidates: Account[]) => {
			return detectDuplicates(accountsRef.current, candidates);
		},
		[],
	);

	const replaceAll = useCallback(
		(next: Account[]) => {
			return enqueue(() => persist(next));
		},
		[persist, enqueue],
	);

	const resetVault = useCallback(() => {
		return enqueue(async () => {
			try {
				if (isSecureStorageAvailable()) {
					await resetVaultWithPassword();
				} else {
					await storage.clearVault();
				}
			} catch (err) {
				setError(toErrorMessage(err));
				throw err;
			}
			// Vault has been deleted – drop stale UI state immediately. On
			// desktop installations without an OS-keychain fallback there is no
			// writable key until a master password is created (VaultLocked with
			// fallback=null). Reseeding mock accounts would then throw
			// "No encryption key available" and previously left stale accounts
			// plus a storage error. Clearing first ensures we either reseed
			// successfully or stay empty and let the password-creation UI take
			// over.
			accountsRef.current = [];
			setAccounts([]);
			setError(null);
			try {
				try {
					const status = await storage.getStatus();
					setStorageStatus(status);
				} catch {
					// ignore – persist will surface storage errors
				}
				await persist(createMockAccounts());
			} catch (err) {
				const msg = toErrorMessage(err);
				if (/unavailable|no encryption key|no key storage/i.test(msg)) {
					// No writable key yet (e.g. fallback null + no password) – keep
					// empty and don't surface a storage error; App shows the
					// LockScreen in "create" mode via vaultStatus.
					accountsRef.current = [];
					setAccounts([]);
					setError(null);
					return;
				}
				throw err;
			}
		});
	}, [persist, enqueue]);

	const clearError = useCallback(() => setError(null), []);

	return {
		accounts,
		loading,
		error,
		storageStatus,
		addAccount,
		deleteAccount,
		importVault,
		importJson,
		importOtpauth,
		importAccounts,
		previewJsonImport,
		previewOtpauthImport,
		detectDuplicatesFor,
		replaceAll,
		resetVault,
		clearError,
		reload,
	};
}