import { useRef, useState } from "react";
import { Download, Fingerprint, Info, KeyRound, Lock, ShieldCheck, Upload } from "lucide-react";
import type { Account, AppSettings } from "../types/account";
import type { StorageStatus } from "../../shared/storageProvider";
import type { VaultStatus } from "../../shared/rpcSchema";
import { Toggle } from "../components/Toggle";
import { downloadVaultFile } from "../services/accountService";
import { changeVaultPassword, createMasterPassword, lockVault } from "../services/storage";

interface SettingsProps {
	accounts: Account[];
	settings: AppSettings;
	onSettingsChange: (settings: AppSettings) => void;
	onImportVault: (json: string) => Promise<void>;
	storageStatus: StorageStatus | null;
	vaultStatus?: VaultStatus | null;
	onVaultReload?: () => void;
}

const APP_VERSION = "0.1.0";

export function Settings({
	accounts,
	settings,
	onSettingsChange,
	onImportVault,
	storageStatus,
	vaultStatus,
	onVaultReload,
}: SettingsProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [masterPw, setMasterPw] = useState("");
	const [masterConfirm, setMasterConfirm] = useState("");
	const [oldPw, setOldPw] = useState("");
	const [newPw, setNewPw] = useState("");
	const [newConfirm, setNewConfirm] = useState("");
	const [vaultMsg, setVaultMsg] = useState<string | null>(null);
	const [vaultError, setVaultError] = useState<string | null>(null);
	const [vaultLoading, setVaultLoading] = useState(false);

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

	function handleImportFile(file: File | undefined | null) {
		if (!file) return;
		file
			.text()
			.then(onImportVault)
			.catch(() => undefined);
	}

	async function handleCreateMaster(e: React.FormEvent) {
		e.preventDefault();
		setVaultError(null);
		setVaultMsg(null);
		if (masterPw.length < 8) {
			setVaultError("Password must be at least 8 characters.");
			return;
		}
		if (masterPw !== masterConfirm) {
			setVaultError("Passwords do not match.");
			return;
		}
		setVaultLoading(true);
		try {
			await createMasterPassword(masterPw);
			setVaultMsg("Master password created. Vault encrypted with Argon2.");
			setMasterPw("");
			setMasterConfirm("");
			onVaultReload?.();
			// Re-fetch not needed – App will update status on next reload, but trigger a window reload hint
			window.dispatchEvent(new CustomEvent("pr5auth:reload-status"));
		} catch (err) {
			setVaultError(err instanceof Error ? err.message : String(err));
		} finally {
			setVaultLoading(false);
		}
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
							<Fingerprint className="h-4 w-4 text-indigo-400" />
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
							<KeyRound className="h-4 w-4 text-indigo-400" />
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
										className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
									/>
									<input
										type="password"
										value={newPw}
										onChange={(e) => setNewPw(e.target.value)}
										placeholder="New password (≥8 chars)"
										className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
									/>
									<input
										type="password"
										value={newConfirm}
										onChange={(e) => setNewConfirm(e.target.value)}
										placeholder="Confirm new password"
										className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
									/>
									{vaultError && <p className="text-xs text-red-300">{vaultError}</p>}
									{vaultMsg && <p className="text-xs text-emerald-300">{vaultMsg}</p>}
									<button
										type="submit"
										disabled={vaultLoading}
										className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
									>
										{vaultLoading ? "Updating…" : "Update password"}
									</button>
								</form>
							</div>
						) : (
							<form onSubmit={handleCreateMaster} className="space-y-3">
								<p className="text-sm font-medium text-slate-200">Create master password</p>
								<p className="text-xs leading-relaxed text-slate-500">
									This will encrypt your vault with Argon2. The password is never stored — you will need it to unlock after inactivity or restart.
								</p>
								<input
									type="password"
									value={masterPw}
									onChange={(e) => setMasterPw(e.target.value)}
									placeholder="Master password (≥8 chars)"
									className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
								/>
								<input
									type="password"
									value={masterConfirm}
									onChange={(e) => setMasterConfirm(e.target.value)}
									placeholder="Confirm password"
									className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
								/>
								{vaultError && <p className="text-xs text-red-300">{vaultError}</p>}
								{vaultMsg && <p className="text-xs text-emerald-300">{vaultMsg}</p>}
								<button
									type="submit"
									disabled={vaultLoading}
									className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
								>
									{vaultLoading ? "Creating…" : "Create password & encrypt vault"}
								</button>
							</form>
						)}
					</div>
				</section>

				<section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl">
					<div className="border-b border-white/[0.06] px-5 py-4">
						<h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
							<ShieldCheck className="h-4 w-4 text-indigo-400" />
							Vault data
						</h3>
					</div>
					<div className="grid grid-cols-2 gap-4 p-5">
						<button
							onClick={() => downloadVaultFile(accounts)}
							className="flex flex-col items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-all duration-200 hover:border-indigo-500/30 hover:bg-white/[0.05]"
						>
							<Download className="h-5 w-5 text-slate-400" />
							<span className="text-sm font-medium text-slate-200">
								Export vault
							</span>
							<span className="text-xs leading-relaxed text-slate-500">
								Download a JSON backup of all your accounts.
							</span>
						</button>

						<button
							onClick={() => fileInputRef.current?.click()}
							className="flex flex-col items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-all duration-200 hover:border-indigo-500/30 hover:bg-white/[0.05]"
						>
							<Upload className="h-5 w-5 text-slate-400" />
							<span className="text-sm font-medium text-slate-200">
								Import vault
							</span>
							<span className="text-xs leading-relaxed text-slate-500">
								Restore accounts from a PR5Auth JSON backup.
							</span>
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept="application/json,.json"
							className="hidden"
							onChange={(event) => {
								void handleImportFile(event.target.files?.[0]);
								event.target.value = "";
							}}
						/>
					</div>
				</section>

				<section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
					<div className="flex items-start gap-3.5">
						<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-950/60">
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
		</div>
	);
}
