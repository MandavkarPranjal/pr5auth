import { useRef } from "react";
import { Download, Fingerprint, Info, ShieldCheck, Upload } from "lucide-react";
import type { Account, AppSettings } from "../types/account";
import type { StorageStatus } from "../../shared/storageProvider";
import { Toggle } from "../components/Toggle";
import { downloadVaultFile } from "../services/accountService";

interface SettingsProps {
	accounts: Account[];
	settings: AppSettings;
	onSettingsChange: (settings: AppSettings) => void;
	onImportVault: (json: string) => Promise<void>;
	storageStatus: StorageStatus | null;
}

const APP_VERSION = "0.1.0";

export function Settings({
	accounts,
	settings,
	onSettingsChange,
	onImportVault,
	storageStatus,
}: SettingsProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const storageAvailable = storageStatus?.available ?? false;
	const storageKind = storageStatus?.kind ?? "unknown";
	const storageLabel = !storageAvailable
		? "Unavailable"
		: storageKind === "os-keychain"
			? "OS keychain"
			: storageKind === "file-encrypted"
				? "Encrypted"
				: "Unknown";
	const storageDetail =
		storageStatus?.detail ??
		(storageAvailable ? "Secure storage active" : "Secure storage unavailable");

	function handleImportFile(file: File | undefined | null) {
		if (!file) return;
		file
			.text()
			.then(onImportVault)
			.catch(() => undefined);
	}

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
