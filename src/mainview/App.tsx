import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, AddAccountInput, AppSettings, Page } from "./types/account";
import { useAccounts } from "./hooks/useAccounts";
import { storage } from "./services/storage";
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
	const { accounts, loading, addAccount, deleteAccount, importVault } = useAccounts();

	const [page, setPage] = useState<Page>("dashboard");
	const [modalOpen, setModalOpen] = useState(false);
	const [modalPrefill, setModalPrefill] = useState<Partial<AddAccountInput> | undefined>();
	const [settings, setSettings] = useState<AppSettings>({ autoLock: true, minimizeToTray: false });
	const [locked, setLocked] = useState(false);
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const accountsRef = useRef<Account[]>([]);
	accountsRef.current = accounts;

	useEffect(() => {
		let cancelled = false;
		storage.loadSettings().then((stored) => {
			if (!cancelled) setSettings(stored);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleSettingsChange = useCallback((next: AppSettings) => {
		setSettings(next);
		void storage.saveSettings(next);
	}, []);

	const notify = useCallback((kind: ToastItem["kind"], message: string) => {
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		setToasts((prev) => [...prev, { id, kind, message }]);
		window.setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 2800);
	}, []);

	const handleSaveAccount = useCallback(
		(input: AddAccountInput) => {
			void addAccount(input).then(() => {
				setModalOpen(false);
				setModalPrefill(undefined);
				notify("success", `Added ${input.issuer}`);
			});
		},
		[addAccount, notify],
	);

	const handleDelete = useCallback(
		(id: string) => {
			void deleteAccount(id);
			notify("info", "Account removed");
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
			setModalPrefill({
				issuer: parsed.issuer,
				accountName: parsed.accountName,
				secret: parsed.secret,
			});
			setModalOpen(true);
			return true;
		},
		[],
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
				setLocked(true);
			}
		}, 1000);
		return () => window.clearInterval(id);
	}, [settings.autoLock, locked]);

	const handleUnlock = useCallback(() => {
		lastActivityRef.current = Date.now();
		setLocked(false);
	}, []);

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
					{loading ? (
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
			{locked && <LockScreen onUnlock={handleUnlock} />}
		</div>
	);
}
