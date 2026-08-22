import { useRef, useState } from "react";
import { Download, Eye, EyeOff, Fingerprint, Info, KeyRound, Lock, ShieldCheck, Upload } from "lucide-react";
import type { Account, AppSettings } from "../types/account";
import type { StorageStatus } from "../../shared/storageProvider";
import type { VaultStatus } from "../../shared/rpcSchema";
import { Toggle } from "../components/Toggle";
import { exportVault } from "../services/accountService";
import { changeVaultPassword, lockVault } from "../services/storage";
import { decryptBackupAsync, encryptBackupAsync, isEncryptedBackup, validateEncryptedBackupStructure } from "../../shared/backupCrypto";
import { APP_VERSION } from "../constants";

interface SettingsProps {
	accounts: Account[];
	settings: AppSettings;
	onSettingsChange: (settings: AppSettings) => void;
	onImportVault: (json: string) => Promise<void>;
	onRestoreVault?: (json: string) => Promise<void>;
	storageStatus: StorageStatus | null;
	vaultStatus?: VaultStatus | null;
	onVaultReload?: () => void;
}

export function Settings({
	accounts,
	settings,
	onSettingsChange,
	onImportVault,
	onRestoreVault,
	storageStatus,
	vaultStatus,
	onVaultReload,
}: SettingsProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [oldPw, setOldPw] = useState("");
	const [newPw, setNewPw] = useState("");
	const [newConfirm, setNewConfirm] = useState("");
	const [vaultMsg, setVaultMsg] = useState<string | null>(null);
	const [vaultError, setVaultError] = useState<string | null>(null);
	const [vaultLoading, setVaultLoading] = useState(false);

	// Encrypted backup & restore state
	const [backupMsg, setBackupMsg] = useState<string | null>(null);
	const [backupError, setBackupError] = useState<string | null>(null);
	const [showExportModal, setShowExportModal] = useState(false);
	const [exportPw, setExportPw] = useState("");
	const [exportConfirm, setExportConfirm] = useState("");
	const [exportShow, setExportShow] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const [exportLoading, setExportLoading] = useState(false);
	const [showRestoreModal, setShowRestoreModal] = useState(false);
	const [restorePw, setRestorePw] = useState("");
	const [restoreShow, setRestoreShow] = useState(false);
	const [restoreError, setRestoreError] = useState<string | null>(null);
	const [restoreLoading, setRestoreLoading] = useState(false);
	const [pendingBackupPayload, setPendingBackupPayload] = useState<string | null>(null);

	const storageAvailable = storageStatus?.available ?? false;
	const storageKind = storageStatus?.kind ?? "unknown";
	const storageLabel = !storageAvailable
		? vaultStatus?.isLocked ? "Locked" : "Unavailable"
		: storageKind === "os-keychain"
			? "OS keychain"
			: storageKind === "file-encrypted"
				? vaultStatus?.hasPassword ? "Argon2id" : "Encrypted"
				: "Unknown";
	const storageDetail =
		storageStatus?.detail ??
		(storageAvailable ? "Secure storage active" : vaultStatus?.isLocked ? "Vault locked — unlock to access" : "Secure storage unavailable");

	async function handleExportEncrypted() {
		setExportError(null);
		if (!exportPw || exportPw.length < 8) {
			setExportError("Export password must be at least 8 characters.");
			return;
		}
		if (exportPw !== exportConfirm) {
			setExportError("Passwords do not match.");
			return;
		}
		setExportLoading(true);
		try {
			const vaultJson = exportVault(accounts);
			const encrypted = await encryptBackupAsync(vaultJson, exportPw);
			const blob = new Blob([encrypted], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			const date = new Date().toISOString().slice(0, 10);
			a.href = url;
			a.download = `pr5auth-backup-${date}.enc.json`;
			a.click();
			URL.revokeObjectURL(url);
			setBackupError(null);
			setBackupMsg("Encrypted backup exported successfully.");
			setShowExportModal(false);
			setExportPw("");
			setExportConfirm("");
		} catch (err) {
			setExportError(err instanceof Error ? err.message : String(err));
		} finally {
			setExportLoading(false);
		}
	}

	async function handleRestoreEncrypted() {
		if (!pendingBackupPayload) return;
		setRestoreError(null);
		if (!restorePw) {
			setRestoreError("Enter backup password.");
			return;
		}
		setRestoreLoading(true);
		try {
			// Validate file integrity and decrypt (AES-256-GCM tag validation)
			const decrypted = await decryptBackupAsync(pendingBackupPayload, restorePw);
			// Restore replaces vault state so deleted accounts and changed secrets are applied
			const restore = onRestoreVault ?? onImportVault;
			await restore(decrypted);
			setBackupError(null);
			setBackupMsg("Backup restored successfully.");
			setShowRestoreModal(false);
			setPendingBackupPayload(null);
			setRestorePw("");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// Differentiate integrity vs wrong password vs corrupt
			if (/wrong password|corrupted|tampered|unrecoverable/i.test(msg)) {
				setRestoreError("Invalid password or corrupted backup file.");
			} else if (/corrupt|invalid|unsupported/i.test(msg)) {
				setRestoreError("Invalid backup file — integrity check failed.");
			} else {
				setRestoreError(msg);
			}
		} finally {
			setRestoreLoading(false);
		}
	}

	function handleImportFile(file: File | undefined | null) {
		if (!file) return;
		setBackupMsg(null);
		setBackupError(null);
		file
			.text()
			.then(async (text) => {
				// Detect encrypted backup file (AES-256-GCM envelope)
				if (isEncryptedBackup(text)) {
					// Validate envelope structure before prompting for password
					try {
						validateEncryptedBackupStructure(text);
					} catch {
						setBackupError("Invalid backup file — integrity check failed.");
						return;
					}
					setPendingBackupPayload(text);
					setRestorePw("");
					setRestoreError(null);
					setShowRestoreModal(true);
					return;
				}
				// Plain JSON vault fallback
				try {
					await onImportVault(text);
					setBackupMsg("Vault imported successfully.");
				} catch (err) {
					setBackupError(err instanceof Error ? err.message : "Import failed — invalid vault file");
				}
			})
			.catch(() => {
				setBackupError("Failed to read file.");
			});
	}

	async function handleChangePassword(e: React.FormEvent) {
		e.preventDefault();
		setVaultError(null);
		setVaultMsg(null);
		if (!oldPw || !newPw) {
			setVaultError("All fields required.");
			return;
		}
		if (newPw.length < 8) {
			setVaultError("New password must be at least 8 characters.");
			return;
		}
		if (newPw !== newConfirm) {
			setVaultError("New passwords do not match.");
			return;
		}
		setVaultLoading(true);
		try {
			await changeVaultPassword(oldPw, newPw);
			setVaultMsg("Master password changed successfully.");
			setOldPw("");
			setNewPw("");
			setNewConfirm("");
			onVaultReload?.();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (/Invalid master password|denied/i.test(msg)) setVaultError("Incorrect current password.");
			else setVaultError(msg);
		} finally {
			setVaultLoading(false);
		}
	}

	async function handleLockNow() {
		if (vaultLoading) return;
		setVaultError(null);
		setVaultMsg(null);
		setVaultLoading(true);
		try {
			await lockVault();
			window.dispatchEvent(new CustomEvent("pr5auth:lock"));
			setVaultMsg("Vault locked.");
		} catch (err) {
			setVaultError(err instanceof Error ? err.message : String(err));
		} finally {
			setVaultLoading(false);
		}
	}

	const hasPassword = vaultStatus?.hasPassword ?? false;
	const isLocked = vaultStatus?.isLocked ?? false;

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<header className="pb-6">
				<h2 className="text-2xl font-semibold tracking-tight text-white">Settings</h2>
				<p className="mt-0.5 text-sm text-slate-500">
					Security and data preferences for your local vault
				</p>
			</header>

			<div className="max-w-2xl space-y-5">
				<section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl">
					<div className="border-b border-white/[0.06] px-5 py-4">
						<h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
							<Fingerprint className="h-4 w-4 text-neutral-300" />
							Security
						</h3>
					</div>
					<div className="divide-y divide-white/[0.04]">
						<Toggle
							checked={settings.autoLock}
							onChange={(autoLock) => onSettingsChange({ ...settings, autoLock })}
							label="Auto lock"
							description="Lock the vault automatically after 5 minutes of inactivity."
						/>
						<Toggle
							checked={settings.minimizeToTray}
							onChange={(minimizeToTray) =>
								onSettingsChange({ ...settings, minimizeToTray })
							}
							label="Minimize to tray"
							description="Keep running in the system tray when minimized."
						/>
						<Toggle
							checked={settings.closeToTray}
							onChange={(closeToTray) =>
								onSettingsChange({ ...settings, closeToTray })
							}
							label="Close to tray"
							description="Keep running in the system tray when the window is closed."
						/>
					</div>
					<div className="flex items-center justify-between gap-4 px-5 py-4">
						<div>
							<p className="text-sm font-medium text-slate-200">
								Secure storage
							</p>
							<p className="mt-0.5 text-xs leading-relaxed text-slate-500">
								{storageDetail}
							</p>
						</div>
						<span
							className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
								storageAvailable
									? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
									: isLocked
										? "border-amber-500/20 bg-amber-500/[0.07] text-amber-300"
										: "border-red-500/20 bg-red-500/[0.07] text-red-300"
							}`}
						>
							{storageLabel}
						</span>
					</div>
				</section>

				<section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl">
					<div className="border-b border-white/[0.06] px-5 py-4">
						<h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
							<KeyRound className="h-4 w-4 text-neutral-300" />
							Master password
						</h3>
					</div>
					<div className="p-5">
						{hasPassword ? (
							<div className="space-y-4">
								<div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
									<div className="flex items-center gap-2 text-sm text-emerald-200">
										<ShieldCheck className="h-4 w-4" />
										Master password set — vault encrypted with Argon2id
									</div>
									{!isLocked && (
										<button
											onClick={handleLockNow}
											disabled={vaultLoading}
											className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<Lock className="h-3.5 w-3.5" />
											Lock now
										</button>
									)}
								</div>
								<p className="text-xs leading-relaxed text-slate-500">
									Your vault key is derived from your master password using Argon2 (t=3, m=64MiB, p=1). The password itself is never stored.
								</p>
								<form onSubmit={handleChangePassword} className="space-y-3">
									<p className="text-sm font-medium text-slate-200">Change master password</p>
									<input
										type="password"
										value={oldPw}
										onChange={(e) => setOldPw(e.target.value)}
										placeholder="Current password"
										className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
									/>
									<input
										type="password"
										value={newPw}
										onChange={(e) => setNewPw(e.target.value)}
										placeholder="New password (≥8 chars)"
										className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
									/>
									<input
										type="password"
										value={newConfirm}
										onChange={(e) => setNewConfirm(e.target.value)}
										placeholder="Confirm new password"
										className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
									/>
									{vaultError && <p className="text-xs text-red-300">{vaultError}</p>}
									{vaultMsg && <p className="text-xs text-emerald-300">{vaultMsg}</p>}
									<button
										type="submit"
										disabled={vaultLoading}
										className="rounded-xl bg-white text-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-200 disabled:opacity-50"
									>
										{vaultLoading ? "Updating…" : "Update password"}
									</button>
								</form>
							</div>
						) : (
							<div className="space-y-3">
								<div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
									<p className="text-sm font-medium text-amber-200">No master password yet</p>
									<p className="text-xs leading-relaxed text-slate-500">
										Create your master password via the lock screen overlay. This settings form is hidden while the vault is in create mode to avoid a duplicate, unwired path — the LockScreen is the single source for initial password creation.
									</p>
								</div>
								{vaultError && <p className="text-xs text-red-300">{vaultError}</p>}
								{vaultMsg && <p className="text-xs text-emerald-300">{vaultMsg}</p>}
							</div>
						)}
					</div>
				</section>

				<section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl">
					<div className="border-b border-white/[0.06] px-5 py-4">
						<h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
							<ShieldCheck className="h-4 w-4 text-neutral-300" />
							Backup & restore
						</h3>
					</div>
					<div className="grid grid-cols-2 gap-4 p-5">
						<button
							onClick={() => {
								setExportError(null);
								setExportPw("");
								setExportConfirm("");
								setShowExportModal(true);
							}}
							className="flex flex-col items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-all duration-200 hover:border-white/25 hover:bg-white/[0.05]"
						>
							<Download className="h-5 w-5 text-slate-400" />
							<span className="text-sm font-medium text-slate-200">
								Export vault
							</span>
							<span className="text-xs leading-relaxed text-slate-500">
								Export vault to encrypted file (AES-256-GCM).
							</span>
						</button>

						<button
							onClick={() => fileInputRef.current?.click()}
							className="flex flex-col items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-all duration-200 hover:border-white/25 hover:bg-white/[0.05]"
						>
							<Upload className="h-5 w-5 text-slate-400" />
							<span className="text-sm font-medium text-slate-200">
								Restore backup
							</span>
							<span className="text-xs leading-relaxed text-slate-500">
								Restore from encrypted backup. Integrity verified.
							</span>
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept="application/json,.json,.enc.json"
							className="hidden"
							onChange={(event) => {
								void handleImportFile(event.target.files?.[0]);
								event.target.value = "";
							}}
						/>
					</div>
					{(backupMsg || backupError) && (
						<div className="px-5 pb-5">
							{backupMsg && <p className="text-xs text-emerald-300">{backupMsg}</p>}
							{backupError && <p className="text-xs text-red-300">{backupError}</p>}
						</div>
					)}
				</section>

				<section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
					<div className="flex items-start gap-3.5">
						<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
							<ShieldCheck className="h-5 w-5 text-white" />
						</div>
						<div>
							<h3 className="text-sm font-semibold text-slate-200">About PR5Auth</h3>
							<p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
								A modern, offline-first desktop authenticator. Your TOTP secrets
								are stored locally on this device and are never sent anywhere.
								Built with Electrobun, React and TypeScript.
							</p>
							<div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
								<span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-medium tabular-nums text-slate-400">
									Version {APP_VERSION}
								</span>
								<span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-medium text-slate-400">
									Offline-first
								</span>
								<span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-1 font-medium text-emerald-300">
									No cloud · No account
								</span>
							</div>
						</div>
						<Info className="ml-auto h-4 w-4 shrink-0 text-slate-600" />
					</div>
				</section>
			</div>

			{/* Export password modal — prompt for export password */}
			{showExportModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
					<div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#12151F] p-6 shadow-2xl">
						<h3 className="text-sm font-semibold text-white">Export encrypted backup</h3>
						<p className="mt-1 text-xs leading-relaxed text-slate-500">Enter a password to encrypt your vault. Uses AES-256-GCM with Argon2id.</p>
						<div className="mt-4 space-y-3">
							<div className="relative">
								<input
									type={exportShow ? "text" : "password"}
									value={exportPw}
									onChange={(e) => setExportPw(e.target.value)}
									placeholder="Export password (≥8 chars)"
									className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
								/>
								<button type="button" onClick={() => setExportShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label={exportShow ? "Hide password" : "Show password"}>
									{exportShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
								</button>
							</div>
							<input
								type={exportShow ? "text" : "password"}
								value={exportConfirm}
								onChange={(e) => setExportConfirm(e.target.value)}
								placeholder="Confirm password"
								className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
							/>
							{exportError && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{exportError}</p>}
							<div className="flex justify-end gap-2 pt-1">
								<button
									onClick={() => {
										setShowExportModal(false);
										setExportError(null);
									}}
									className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.06]"
								>
									Cancel
								</button>
								<button
									onClick={() => void handleExportEncrypted()}
									disabled={exportLoading}
									className="rounded-xl bg-white text-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-200 disabled:opacity-50"
								>
									{exportLoading ? "Encrypting…" : "Export"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Restore password modal — prompt for restore password and validate integrity */}
			{showRestoreModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
					<div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#12151F] p-6 shadow-2xl">
						<h3 className="text-sm font-semibold text-white">Restore encrypted backup</h3>
						<p className="mt-1 text-xs leading-relaxed text-slate-500">Enter the backup password to decrypt. File integrity will be validated (AES-256-GCM auth tag).</p>
						<div className="mt-4 space-y-3">
							<div className="relative">
								<input
									type={restoreShow ? "text" : "password"}
									value={restorePw}
									onChange={(e) => setRestorePw(e.target.value)}
									placeholder="Backup password"
									className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
								/>
								<button type="button" onClick={() => setRestoreShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label={restoreShow ? "Hide password" : "Show password"}>
									{restoreShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
								</button>
							</div>
							{restoreError && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{restoreError}</p>}
							<div className="flex justify-end gap-2 pt-1">
								<button
									onClick={() => {
										setShowRestoreModal(false);
										setRestoreError(null);
										setPendingBackupPayload(null);
									}}
									className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.06]"
								>
									Cancel
								</button>
								<button
									onClick={() => void handleRestoreEncrypted()}
									disabled={restoreLoading}
									className="rounded-xl bg-white text-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-200 disabled:opacity-50"
								>
									{restoreLoading ? "Decrypting…" : "Restore"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
