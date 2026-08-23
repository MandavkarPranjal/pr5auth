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
import { Settings } from "./pages/Settings";
import { ImportWizard } from "./components/ImportWizard";
import type { ImportStrategy } from "./services/accountService";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { DashboardSkeleton, PageSkeleton } from "./components/Skeleton";
import { About } from "./pages/About";
import { UpdateBanner } from "./components/UpdateBanner";
import { updateService } from "./services/updateService";

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
		restoreVault,
		importJson,
		importAccounts,
		replaceAll,
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
	const [wizardImporting, setWizardImporting] = useState(false);

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
			if (wizardImporting) {
				notify("info", "Import in progress — please wait");
				return;
			}
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
		[addAccount, notify, wizardImporting],
	);

	const handleDelete = useCallback(
		(id: string) => {
			if (wizardImporting) {
				notify("info", "Import in progress — please wait");
				return;
			}
			void deleteAccount(id)
				.then(() => notify("info", "Account removed"))
				.catch((err: unknown) => {
					notify(
						"error",
						err instanceof Error ? err.message : "Failed to remove account",
					);
				});
		},
		[deleteAccount, notify, wizardImporting],
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
		async (json: string): Promise<void> => {
			try {
				// Migration-aware import: merge by default, skip duplicates, support multi-format JSON
				// Throw on storage/persist failure so caller (Settings) does not show success.
				// No toast here — caller owns presentation to avoid duplicate toast + inline.
				await importJson(json, "merge");
				return;
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				const isFormatError = /invalid|unrecognized|no accounts|no valid/i.test(msg);
				if (!isFormatError) {
					throw err;
				}
				// Format-parsing failure — fallback to legacy vault import for backward compatibility
				await importVault(json);
				return;
			}
		},
		[importJson, importVault],
	);

	const handleRestoreVault = useCallback(
		async (json: string): Promise<void> => {
			// Use restore-specific path that permits empty vaults; do not toast here
			// so Settings (inline) is the single owner of presentation and we avoid
			// duplicate toast + inline messages. Throw on failure so Settings does not
			// mark success.
			await restoreVault(json);
		},
		[restoreVault],
	);

	const handleWizardImport = useCallback(
		async (toImport: Account[], strategy: ImportStrategy) => {
			setWizardImporting(true);
			try {
				if (strategy === "replace") {
					await replaceAll(toImport);
					notify("success", `Vault replaced with ${toImport.length} account${toImport.length === 1 ? "" : "s"}`);
				} else {
					const result = await importAccounts(toImport, strategy);
					if (result.duplicates.length > 0 && result.uniques.length === 0) {
						notify("info", "All accounts were duplicates — nothing imported");
					} else if (result.duplicates.length > 0) {
						notify("success", `Imported ${result.uniques.length} new, skipped ${result.duplicates.length} duplicate${result.duplicates.length === 1 ? "" : "s"}`);
					} else {
						notify("success", `Imported ${result.uniques.length} account${result.uniques.length === 1 ? "" : "s"}`);
					}
				}
			} finally {
				setWizardImporting(false);
			}
		},
		[replaceAll, importAccounts, notify],
	);

	const handleNavigate = useCallback(
		(next: Page) => {
			if (wizardImporting) {
				notify("info", "Import in progress — please wait");
				return;
			}
			setPage(next);
		},
		[wizardImporting, notify],
	);

	useKeyboardShortcuts([
		{
			key: "k",
			mod: true,
			allowInInput: true,
			enabled: !modalOpen && !locked && !wizardImporting,
			handler: () => document.getElementById("account-search")?.focus(),
		},
		{
			key: "n",
			enabled: !modalOpen && !locked && !wizardImporting,
			handler: () => { setPage("dashboard"); setModalOpen(true); },
		},
		{ key: "1", enabled: !modalOpen && !locked, handler: () => handleNavigate("dashboard") },
		{ key: "2", enabled: !modalOpen && !locked, handler: () => handleNavigate("import") },
		{ key: "3", enabled: !modalOpen && !locked, handler: () => handleNavigate("settings") },
		{ key: "4", enabled: !modalOpen && !locked, handler: () => handleNavigate("about") },
		{ key: "Escape", handler: () => { if (modalOpen) { setModalOpen(false); setModalPrefill(undefined); } } },
	], [modalOpen, locked, wizardImporting, handleNavigate]);

	// Auto-lock after inactivity when enabled.
	const lastActivityRef = useRef<number>(Date.now());
	const autoLockInFlightRef = useRef(false);
	const autoLockRetryAfterRef = useRef(0);
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
			if (Date.now() - lastActivityRef.current < AUTO_LOCK_MS) return;
			if (autoLockInFlightRef.current) return;
			if (Date.now() < autoLockRetryAfterRef.current) return;
			autoLockInFlightRef.current = true;
			void lockVault()
				.then(() => {
					setVaultStatus((prev: VaultStatus | null) => (prev ? { ...prev, isLocked: true } : prev));
					setLocked(true);
				})
				.catch(() => {
					// Throttle retries: repeated lock failures are serialized
					// with storage writes in the backend queue, so retrying
					// every second can starve normal operations.
					autoLockRetryAfterRef.current = Date.now() + 30_000;
				})
				.finally(() => {
					autoLockInFlightRef.current = false;
				});
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

	// Non-intrusive update check on startup – at most once via bun service + view dedup
	useEffect(() => {
		void updateService.checkOnceOnStartup().catch(() => {
			// Never block startup; update failures are non-fatal
		})
	}, [])

	// Don't show storage error banner when vault is locked – it's expected
	const showError = error && !locked && !vaultLoading;

	return (
		<div className="app-shell flex h-screen w-screen overflow-hidden bg-black text-white selection:bg-white/20">
			<Sidebar
				page={page}
				onNavigate={handleNavigate}
				accountCount={accounts.length}
				locked={locked}
			/>

			<main className="app-main relative z-10 flex-1 overflow-hidden">
				<div className="page-scroll h-full overflow-y-auto p-8">
					{!locked && !vaultLoading && (
						<div className="mb-4">
							<UpdateBanner onNavigateToSettings={() => setPage("settings")} />
						</div>
					)}
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
									disabled={wizardImporting}
									onClick={() => {
										if (wizardImporting) {
											notify("info", "Import in progress — please wait");
											return;
										}
										void resetVault().catch((err: unknown) =>
											notify(
												"error",
												err instanceof Error
													? err.message
													: "Reset failed",
											),
										);
									}}
									className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
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
						<PageSkeleton />
					) : loading ? (
						page === "dashboard" ? <DashboardSkeleton /> : <PageSkeleton />
					) : (
						<>
							{page === "dashboard" && (
								<Dashboard
									accounts={accounts}
									onAdd={() => {
										if (wizardImporting) {
											notify("info", "Import in progress — please wait");
											return;
										}
										setModalPrefill(undefined);
										setModalOpen(true);
									}}
									onDelete={handleDelete}
									onCopy={handleCopy}
								/>
							)}
							{page === "import" && (
								<ImportWizard
									existingAccounts={accounts}
									onImport={handleWizardImport}
								/>
							)}
							{page === "settings" && (
								<Settings
									accounts={accounts}
									settings={settings}
									onSettingsChange={handleSettingsChange}
									onImportVault={handleImportVault}
									onRestoreVault={handleRestoreVault}
									storageStatus={storageStatus}
									vaultStatus={vaultStatus}
									onVaultReload={handleVaultReload}
								/>
							)}
							{page === "about" && <About />}
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
