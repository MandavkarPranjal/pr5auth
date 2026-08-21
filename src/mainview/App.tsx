import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, AddAccountInput, AppSettings, Page } from "./types/account";
import { useAccounts } from "./hooks/useAccounts";
import {
	notifyTrayCount,
	notifyTraySettings,
	storage,
	getVaultStatus,
	createMasterPassword,
	unlockVault,
	lockVault,
} from "./services/storage";
import type { VaultStatus } from "../shared/rpcSchema";
import { parseOtpauthUri } from "./services/accountService";
import { Sidebar } from "./components/Sidebar";
import { AddAccountModal } from "./components/AddAccountModal";
import { Toast, type ToastItem } from "./components/Toast";
import { LockScreen } from "./components/LockScreen";
import { Dashboard } from "./pages/Dashboard";
import { ImportQR } from "./pages/ImportQR";
import { Settings } from "./pages/Settings";

const AUTO_LOCK_MS = 5 * 60 * 1000;

export default function App() {
	const {
		accounts,
		loading,
		error,
		storageStatus,
		addAccount,
		deleteAccount,
		importVault,
		resetVault,
		clearError,
		reload,
	} = useAccounts();

	const [page, setPage] = useState<Page>("dashboard");
	const [modalOpen, setModalOpen] = useState(false);
	const [modalPrefill, setModalPrefill] = useState<Partial<AddAccountInput> | undefined>();
	const [settings, setSettings] = useState<AppSettings>({ autoLock: true, minimizeToTray: false, closeToTray: false });
	const [locked, setLocked] = useState(false);
	const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
	const [vaultLoading, setVaultLoading] = useState(true);
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const accountsRef = useRef<Account[]>([]);
	accountsRef.current = accounts;
	const lockedRef = useRef(locked);
	const vaultLoadingRef = useRef(vaultLoading);
	useEffect(() => {
		lockedRef.current = locked;
	}, [locked]);
	useEffect(() => {
		vaultLoadingRef.current = vaultLoading;
	}, [vaultLoading]);

	const notify = useCallback((kind: ToastItem["kind"], message: string) => {
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		setToasts((prev) => [...prev, { id, kind, message }]);
		window.setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 2800);
	}, []);

	// Initial vault status check – determines initial lock state
	useEffect(() => {
		let cancelled = false;
		getVaultStatus()
			.then((status) => {
				if (cancelled) return;
				setVaultStatus(status);
				if (status) {
					if (!status.hasPassword) {
						// No master password yet – require creation
						setLocked(true);
					} else if (status.isLocked) {
						setLocked(true);
					} else {
						setLocked(false);
					}
				} else {
					// Outside Electrobun (e.g. vite preview) – no vault locking
					setLocked(false);
				}
			})
			.catch(() => {
				if (cancelled) return;
				// Desktop RPC failed – unknown vault state must not fail open
				setVaultStatus({ hasPassword: true, isLocked: true });
				setLocked(true);
			})
			.finally(() => {
				if (!cancelled) setVaultLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		storage
			.loadSettings()
			.then((stored) => {
				if (!cancelled) {
					setSettings(stored);
					void notifyTraySettings(stored);
				}
			})
			.catch((err: unknown) => {
				// Don't show settings error when vault is locked – settings are encrypted.
				// Use refs so the async rejection reads the current lock state instead
				// of the stale `locked` closure from the initial render. On boot a
				// password-protected vault is already locked, but `locked` is still
				// false until the vault-status effect resolves, so the closure check
				// would spuriously toast "Vault is locked...".
				const msg = err instanceof Error ? err.message : String(err);
				if (/locked|denied/i.test(msg) && (lockedRef.current || vaultLoadingRef.current)) return;
				if (!cancelled) {
					notify(
						"error",
						err instanceof Error ? err.message : "Failed to load settings",
					);
				}
			});
		return () => {
			cancelled = true;
		};
		// Reload settings when vault is unlocked
	}, [notify, locked, reload]);

	// Sync account count to tray tooltip - publish only after hydration succeeds
	// to avoid overwriting the persisted tray count from the main process with 0
	// during startup, and preserve main-process count when loading fails.
	// Note: error intentionally omitted from deps so dismissing the storage-error
	// banner (clearError) does not republish 0 and clobber the preserved count.
	useEffect(() => {
		if (loading) return;
		if (error) return;
		void notifyTrayCount(accounts.length);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [accounts.length, loading]);

	// Listen for tray Lock Vault action
	useEffect(() => {
		const handler = () => {
			// Backend already locked via RPC, just reflect in UI
			void getVaultStatus()
				.then((s) => {
					if (s) setVaultStatus(s);
				})
				.catch(() => {
					// Vault status unavailable or metadata corrupt – keep
					// the already-applied locked UI state and avoid an
					// unhandled promise rejection.
				});
			setLocked(true);
		};
		window.addEventListener("pr5auth:lock", handler);
		return () => window.removeEventListener("pr5auth:lock", handler);
	}, []);

	const handleSettingsChange = useCallback(
		(next: AppSettings) => {
			setSettings(next);
			void storage.saveSettings(next).catch((err: unknown) => {
				notify(
					"error",
					err instanceof Error ? err.message : "Failed to save settings",
				);
			});
			void notifyTraySettings(next);
		},
		[notify],
	);

	const handleSaveAccount = useCallback(
		(input: AddAccountInput) => {
			void addAccount(input)
				.then(() => {
					setModalOpen(false);
					setModalPrefill(undefined);
					notify("success", `Added ${input.issuer}`);
				})
				.catch((err: unknown) => {
					notify(
						"error",
						err instanceof Error ? err.message : "Failed to save account",
					);
				});
		},
		[addAccount, notify],
	);

	const handleDelete = useCallback(
		(id: string) => {
			void deleteAccount(id)
				.then(() => notify("info", "Account removed"))
				.catch((err: unknown) => {
					notify(
						"error",
						err instanceof Error ? err.message : "Failed to remove account",
					);
				});
		},
		[deleteAccount, notify],
	);

	const handleCopy = useCallback(
		(account: Account, code: string) => {
			void navigator.clipboard.writeText(code).catch(() => undefined);
			notify("success", `${account.issuer} code copied`);
		},
		[notify],
	);

	const handleAddParsedUri = useCallback(
		(uri: string) => {
			const parsed = parseOtpauthUri(uri);
			if (!parsed) return false;
			void addAccount(parsed)
				.then(() => notify("success", `Added ${parsed.issuer}`))
				.catch((err: unknown) => {
					notify(
						"error",
						err instanceof Error ? err.message : "Failed to save account",
					);
				});
			return true;
		},
		[addAccount, notify],
	);

	const handleImportVault = useCallback(
		async (json: string) => {
			try {
				const count = await importVault(json);
				notify("success", `Imported ${count} account${count === 1 ? "" : "s"}`);
			} catch {
				notify("error", "Import failed — invalid vault file");
			}
		},
		[importVault, notify],
	);

	// Auto-lock after inactivity when enabled.
	const lastActivityRef = useRef<number>(Date.now());
	const activityHandlersRef = useRef(false);

	useEffect(() => {
		if (activityHandlersRef.current) return;
		activityHandlersRef.current = true;
		const bump = () => {
			lastActivityRef.current = Date.now();
		};
		window.addEventListener("pointerdown", bump);
		window.addEventListener("keydown", bump);
		return () => {
			window.removeEventListener("pointerdown", bump);
			window.removeEventListener("keydown", bump);
		};
	}, []);

	useEffect(() => {
		if (!settings.autoLock || locked) return;
		const id = window.setInterval(() => {
			if (Date.now() - lastActivityRef.current >= AUTO_LOCK_MS) {
				void lockVault()
					.then(() => {
						setVaultStatus((prev: VaultStatus | null) => (prev ? { ...prev, isLocked: true } : prev));
						setLocked(true);
					})
					.catch(() => undefined);
			}
		}, 1000);
		return () => window.clearInterval(id);
	}, [settings.autoLock, locked]);

	const handleUnlock = useCallback(async (password: string) => {
		await unlockVault(password);
		lastActivityRef.current = Date.now();
		const status = await getVaultStatus().catch(() => null);
		if (status) setVaultStatus(status);
		setLocked(false);
		notify("success", "Vault unlocked");
		reload();
	}, [notify, reload]);

	const handleCreate = useCallback(async (password: string) => {
		await createMasterPassword(password);
		lastActivityRef.current = Date.now();
		const status = await getVaultStatus().catch(() => null);
		if (status) setVaultStatus(status);
		else setVaultStatus({ hasPassword: true, isLocked: false });
		setLocked(false);
		notify("success", "Master password created");
		reload();
	}, [notify, reload]);

	const refreshVaultStatus = useCallback(() => {
		void getVaultStatus()
			.then((s) => {
				if (s) setVaultStatus(s);
			})
			.catch(() => undefined);
	}, []);

	const handleVaultReload = useCallback(() => {
		reload();
		refreshVaultStatus();
	}, [reload, refreshVaultStatus]);

	// Don't show storage error banner when vault is locked – it's expected
	const showError = error && !locked && !vaultLoading;

	return (
		<div className="flex h-screen w-screen overflow-hidden bg-[#0A0D14] text-slate-200 selection:bg-indigo-500/30">
			{/* ambient background glow */}
			<div className="pointer-events-none fixed inset-0 overflow-hidden">
				<div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-indigo-600/[0.09] blur-[120px]" />
				<div className="absolute -bottom-48 right-1/5 h-96 w-96 rounded-full bg-violet-600/[0.07] blur-[120px]" />
			</div>

			<Sidebar
				page={page}
				onNavigate={setPage}
				accountCount={accounts.length}
				locked={locked}
			/>

			<main className="relative z-10 flex-1 overflow-hidden">
				<div className="h-full overflow-y-auto p-8">
					{showError && (
						<div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
							<div>
								<p className="text-sm font-semibold text-red-200">
									Storage error
								</p>
								<p className="mt-1 text-xs leading-relaxed text-red-300/80">
									{error}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<button
									onClick={() => {
										void resetVault().catch((err: unknown) =>
											notify(
												"error",
												err instanceof Error
													? err.message
													: "Reset failed",
											),
										);
									}}
									className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-400/10"
								>
									Reset vault
								</button>
								<button
									onClick={clearError}
									className="rounded-lg p-1 text-red-300/70 hover:text-red-200"
									aria-label="Dismiss"
								>
									✕
								</button>
							</div>
						</div>
					)}
					{vaultLoading ? (
						<div className="flex h-full items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.08] border-t-indigo-500" />
						</div>
					) : loading ? (
						<div className="flex h-full items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.08] border-t-indigo-500" />
						</div>
					) : (
						<>
							{page === "dashboard" && (
								<Dashboard
									accounts={accounts}
									onAdd={() => {
										setModalPrefill(undefined);
										setModalOpen(true);
									}}
									onDelete={handleDelete}
									onCopy={handleCopy}
								/>
							)}
							{page === "import" && (
								<ImportQR
									onAddParsed={handleAddParsedUri}
									onOpenModal={(prefill) => {
										setModalPrefill(prefill);
										setModalOpen(true);
									}}
								/>
							)}
							{page === "settings" && (
								<Settings
									accounts={accounts}
									settings={settings}
									onSettingsChange={handleSettingsChange}
									onImportVault={handleImportVault}
									storageStatus={storageStatus}
									vaultStatus={vaultStatus}
									onVaultReload={handleVaultReload}
								/>
							)}
						</>
					)}
				</div>
			</main>

			<AddAccountModal
				open={modalOpen}
				initial={modalPrefill}
				onSave={handleSaveAccount}
				onCancel={() => {
					setModalOpen(false);
					setModalPrefill(undefined);
				}}
			/>

			<Toast items={toasts} />
			{locked && (
				<LockScreen
					mode={vaultStatus && !vaultStatus.hasPassword ? "create" : "unlock"}
					onUnlock={handleUnlock}
					onCreate={handleCreate}
				/>
			)}
		</div>
	);
}
