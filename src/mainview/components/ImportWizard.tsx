import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, FileJson, Link2, ShieldCheck, Upload, X, ImageUp, Loader2 } from "lucide-react";
import type { Account } from "../types/account";
import type { ImportStrategy, ImportPreview } from "../services/accountService";
import {
	buildJsonImportPreview,
	buildOtpauthImportPreview,
	createAccountsFromParsed,
	parseJsonImport,
	parseOtpauthBatch,
	detectDuplicates,
} from "../services/accountService";
import { decodeQrFromFile } from "../services/qr";

type WizardStep = "source" | "preview" | "confirm";
type SourceTab = "otpauth" | "json" | "qr";

interface ImportWizardProps {
	existingAccounts: Account[];
	onImport: (accounts: Account[], strategy: ImportStrategy) => Promise<void>;
	onClose?: () => void;
}

export function ImportWizard({ existingAccounts, onImport, onClose }: ImportWizardProps) {
	const [step, setStep] = useState<WizardStep>("source");
	const [sourceTab, setSourceTab] = useState<SourceTab>("otpauth");
	const [otpauthInput, setOtpauthInput] = useState("");
	const [jsonText, setJsonText] = useState<string | null>(null);
	const [jsonFileName, setJsonFileName] = useState<string | null>(null);
	const [strategy, setStrategy] = useState<ImportStrategy>("merge");
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [qrError, setQrError] = useState<string | null>(null);
	const [qrScanning, setQrScanning] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const qrFileInputRef = useRef<HTMLInputElement>(null);

	// Derived preview
	const otpauthPreview: ImportPreview | null = useMemo(() => {
		if (sourceTab !== "otpauth" || !otpauthInput.trim()) return null;
		return buildOtpauthImportPreview(existingAccounts, otpauthInput);
	}, [existingAccounts, otpauthInput, sourceTab]);

	const jsonPreview: ImportPreview | null = useMemo(() => {
		if (sourceTab !== "json" || jsonText === null) return null;
		return buildJsonImportPreview(existingAccounts, jsonText);
	}, [existingAccounts, jsonText, sourceTab]);

	const activePreview = sourceTab === "otpauth" ? otpauthPreview : jsonPreview;

	const candidates: Account[] = useMemo(() => {
		if (sourceTab === "otpauth") {
			if (!otpauthInput.trim()) return [];
			const { parsed } = parseOtpauthBatch(otpauthInput);
			return createAccountsFromParsed(parsed);
		}
		if (sourceTab === "json" && jsonText !== null) {
			try {
				const { accounts } = parseJsonImport(jsonText);
				return accounts;
			} catch {
				return [];
			}
		}
		return [];
	}, [otpauthInput, jsonText, sourceTab]);

	const duplicateInfo = useMemo(() => {
		if (candidates.length === 0) return { duplicates: [] as Account[], uniques: [] as Account[] };
		return detectDuplicates(existingAccounts, candidates);
	}, [existingAccounts, candidates]);

	const canProceedToPreview = useMemo(() => {
		if (sourceTab === "otpauth") return otpauthPreview !== null && otpauthPreview.valid > 0;
		if (sourceTab === "json") return jsonPreview !== null && jsonPreview.valid > 0;
		return false;
	}, [sourceTab, otpauthPreview, jsonPreview]);

	useEffect(() => {
		// Reset error when input changes
		setError(null);
	}, [otpauthInput, jsonText, sourceTab]);

	async function handleJsonFile(file: File | null | undefined) {
		if (!file) return;
		setError(null);
		setJsonFileName(file.name);
		try {
			const text = await file.text();
			// Validate JSON early to give feedback
			try {
				JSON.parse(text);
			} catch {
				setError("Invalid JSON file – not a valid JSON document.");
				setJsonText(null);
				return;
			}
			setJsonText(text);
			setStep("preview");
		} catch {
			setError("Could not read JSON file.");
		}
	}

	async function handleQrFile(file: File | null | undefined) {
		if (!file) return;
		setQrError(null);
		setQrScanning(true);
		try {
			const raw = await decodeQrFromFile(file);
			if (!raw) {
				setQrError("No QR code found in this image.");
				return;
			}
			// Try as otpauth URI
			const batch = parseOtpauthBatch(raw);
			if (batch.parsed.length > 0) {
				setSourceTab("otpauth");
				setOtpauthInput(raw);
				setStep("preview");
				setQrError(null);
			} else {
				setQrError("The QR code does not contain a valid otpauth:// URI.");
			}
		} catch {
			setQrError("Could not read this image. Try a clearer photo.");
		} finally {
			setQrScanning(false);
		}
	}

	async function handleConfirmImport() {
		if (candidates.length === 0) return;
		setImporting(true);
		setError(null);
		try {
			// Filter according to strategy: merge = skip duplicates, replace = import all
			const toImport = strategy === "replace" ? candidates : duplicateInfo.uniques;
			if (toImport.length === 0 && strategy !== "replace") {
				setError("All accounts are duplicates — nothing to import. Choose 'Replace vault' to overwrite or add new accounts.");
				setImporting(false);
				return;
			}
			await onImport(strategy === "replace" ? candidates : toImport, strategy);
			setStep("confirm");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setImporting(false);
		}
	}

	const totalValid = activePreview?.valid ?? 0;
	const totalDuplicates = activePreview?.duplicates ?? 0;
	const totalUniques = activePreview?.uniques ?? 0;

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<header className="pb-6">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-2xl font-semibold tracking-tight text-white">Import wizard</h2>
						<p className="mt-0.5 text-sm text-slate-500">
							Import standard otpauth entries or exported JSON files — with migration and duplicate handling
						</p>
					</div>
					{onClose && (
						<button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200" aria-label="Close">
							<X className="h-4 w-4" />
						</button>
					)}
				</div>

				{/* Step indicator */}
				<div className="mt-6 flex items-center gap-2">
					{[
						{ id: "source", label: "1 · Source" },
						{ id: "preview", label: "2 · Preview" },
						{ id: "confirm", label: "3 · Import" },
					].map((s, idx) => {
						const isActive = step === s.id;
						const isPast = (step === "preview" && idx === 0) || (step === "confirm" && idx < 2);
						return (
							<div key={s.id} className="flex items-center gap-2">
								<span
									className={`rounded-full px-3 py-1 text-xs font-medium ${
										isActive
											? "bg-indigo-600 text-white"
											: isPast
												? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
												: "bg-white/[0.04] text-slate-500 border border-white/[0.06]"
									}`}
								>
									{s.label}
								</span>
								{idx < 2 && <ChevronRight className="h-3 w-3 text-slate-600" />}
							</div>
						);
					})}
				</div>
			</header>

			{step === "source" && (
				<div className="space-y-6">
					{/* Source tab selector */}
					<div className="flex gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1.5">
						{[
							{ id: "otpauth", label: "otpauth URI", icon: Link2 },
							{ id: "json", label: "JSON file", icon: FileJson },
							{ id: "qr", label: "QR image", icon: ImageUp },
						].map((tab) => {
							const Icon = tab.icon as typeof Link2;
							const active = sourceTab === tab.id;
							return (
								<button
									key={tab.id}
									onClick={() => setSourceTab(tab.id as SourceTab)}
									className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
										active
											? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/40"
											: "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
									}`}
								>
									<Icon className="h-3.5 w-3.5" />
									{tab.label}
								</button>
							);
						})}
					</div>

					{sourceTab === "otpauth" && (
						<div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
							<div className="mb-3 flex items-center gap-2.5">
								<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
									<Link2 className="h-4 w-4 text-slate-400" />
								</div>
								<h3 className="text-sm font-semibold text-slate-200">Paste otpauth:// URI(s)</h3>
							</div>
							<p className="mb-3 text-xs leading-relaxed text-slate-500">
								Paste one or many standard otpauth entries (newline or comma separated). Duplicates against your vault are detected automatically.
							</p>
							<textarea
								value={otpauthInput}
								onChange={(e) => setOtpauthInput(e.target.value)}
								rows={5}
								placeholder={`otpauth://totp/GitHub:dev@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub\n otpauth://totp/Google:you@gmail.com?secret=GEZDGNBVGY3TQOJQ...`}
								className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 font-mono text-xs leading-relaxed text-slate-300 placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500/40 focus:shadow-[0_0_0_3px] focus:shadow-indigo-500/10"
							/>
							{otpauthPreview && (
								<div
									className={`mt-4 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${
										otpauthPreview.valid > 0
											? "border-emerald-500/20 bg-emerald-500/[0.06]"
											: "border-amber-500/20 bg-amber-500/[0.06]"
									}`}
								>
									<div className="min-w-0">
										<p className={`text-sm font-medium ${otpauthPreview.valid > 0 ? "text-emerald-200" : "text-amber-200"}`}>
											{otpauthPreview.valid} valid · {otpauthPreview.invalid} invalid
											{otpauthPreview.duplicates > 0 && ` · ${otpauthPreview.duplicates} duplicate${otpauthPreview.duplicates === 1 ? "" : "s"}`}
										</p>
										<p className="mt-0.5 text-[11px] text-slate-500">
											{otpauthPreview.uniques} new · {otpauthPreview.duplicates} already in vault
										</p>
									</div>
									{otpauthPreview.errors.length > 0 && (
										<span className="text-[11px] text-amber-400">{otpauthPreview.errors[0].reason}</span>
									)}
								</div>
							)}
							<div className="mt-4 flex justify-end">
								<button
									onClick={() => canProceedToPreview && setStep("preview")}
									disabled={!canProceedToPreview}
									className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
								>
									Continue <ChevronRight className="h-4 w-4" />
								</button>
							</div>
						</div>
					)}

					{sourceTab === "json" && (
						<div className="space-y-4">
							<div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
								<div className="mb-3 flex items-center gap-2.5">
									<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
										<FileJson className="h-4 w-4 text-slate-400" />
									</div>
									<h3 className="text-sm font-semibold text-slate-200">Import from exported JSON</h3>
								</div>
								<p className="mb-3 text-xs leading-relaxed text-slate-500">
									Supports PR5Auth vault exports, plain account arrays, and Aegis JSON. Migration is handled automatically.
								</p>

								<div
									onClick={() => fileInputRef.current?.click()}
									className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] p-8 text-center transition-all hover:border-indigo-500/30 hover:bg-white/[0.04]"
								>
									<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10">
										<Upload className="h-6 w-6 text-indigo-400" />
									</div>
									<p className="mt-4 text-sm font-medium text-slate-200">
										{jsonFileName ? jsonFileName : "Upload JSON file"}
									</p>
									<p className="mt-1 text-xs text-slate-500">Click to browse · application/json</p>
								</div>
								<input
									ref={fileInputRef}
									type="file"
									accept="application/json,.json"
									className="hidden"
									onChange={(e) => {
										void handleJsonFile(e.target.files?.[0]);
										e.target.value = "";
									}}
								/>

								{jsonPreview && (
									<div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
										<p className="text-sm font-medium text-emerald-200">
											Found {jsonPreview.valid} account{jsonPreview.valid === 1 ? "" : "s"} in {jsonPreview.source}
										</p>
										<p className="mt-0.5 text-[11px] text-emerald-400/70">
											{jsonPreview.uniques} new · {jsonPreview.duplicates} duplicate{jsonPreview.duplicates === 1 ? "" : "s"} · {jsonPreview.invalid} invalid
										</p>
									</div>
								)}

								{jsonPreview && jsonPreview.valid > 0 && (
									<div className="mt-4 flex justify-end">
										<button
											onClick={() => setStep("preview")}
											className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all hover:bg-indigo-500"
										>
											Continue <ChevronRight className="h-4 w-4" />
										</button>
									</div>
								)}
							</div>

							<div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-xs leading-relaxed text-slate-500">
								<p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Migration workflow</p>
								<ul className="mt-2.5 space-y-1.5">
									<li>1 · File is parsed and validated offline.</li>
									<li>2 · Accounts are checked for duplicates (issuer + name or secret).</li>
									<li>3 · Choose “Merge” to skip duplicates or “Replace” to overwrite.</li>
									<li>4 · Vault is saved atomically — nothing leaves this device.</li>
								</ul>
							</div>
						</div>
					)}

					{sourceTab === "qr" && (
						<div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
							<div className="mb-3 flex items-center gap-2.5">
								<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
									<ImageUp className="h-4 w-4 text-slate-400" />
								</div>
								<h3 className="text-sm font-semibold text-slate-200">Import from QR image</h3>
							</div>
							<div
								onClick={() => qrFileInputRef.current?.click()}
								className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] p-8 text-center transition-all hover:border-indigo-500/30 hover:bg-white/[0.04]"
							>
								<input ref={qrFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void handleQrFile(e.target.files?.[0]); e.target.value = ""; }} />
								{qrScanning ? (
									<>
										<Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
										<p className="mt-4 text-sm font-medium text-slate-300">Scanning QR code…</p>
									</>
								) : (
									<>
										<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10">
											<ImageUp className="h-6 w-6 text-indigo-400" />
										</div>
										<p className="mt-4 text-sm font-medium text-slate-200">Upload QR code image</p>
										<p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">PNG, JPEG and WebP supported · decoded offline</p>
									</>
								)}
							</div>
							{qrError && (
								<p className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-xs text-red-400">
									<X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {qrError}
								</p>
							)}
						</div>
					)}

					{error && <p className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-xs text-red-400">{error}</p>}
				</div>
			)}

			{step === "preview" && activePreview && (
				<div className="space-y-6">
					<div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
						<h3 className="text-sm font-semibold text-slate-200">Preview</h3>
						<p className="mt-1 text-xs text-slate-500">
							{activePreview.source} · {activePreview.valid} valid · {activePreview.invalid} invalid
						</p>

						<div className="mt-4 grid grid-cols-3 gap-3">
							<div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
								<p className="text-lg font-semibold text-white">{totalValid}</p>
								<p className="text-[11px] text-slate-500">Total</p>
							</div>
							<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-center">
								<p className="text-lg font-semibold text-emerald-300">{totalUniques}</p>
								<p className="text-[11px] text-emerald-400/70">New</p>
							</div>
							<div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-center">
								<p className="text-lg font-semibold text-amber-300">{totalDuplicates}</p>
								<p className="text-[11px] text-amber-400/70">Duplicates</p>
							</div>
						</div>

						{candidates.length > 0 && (
							<div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
								{candidates.map((c, idx) => {
									const isDup = duplicateInfo.duplicates.some(
										(d) => d.secret === c.secret || (d.issuer.toLowerCase() === c.issuer.toLowerCase() && d.accountName.toLowerCase() === c.accountName.toLowerCase()),
									);
									return (
										<div
											key={`${c.issuer}-${c.accountName}-${idx}`}
											className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
												isDup ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-white/[0.06] bg-white/[0.02]"
											}`}
										>
											<div className="min-w-0">
												<p className="truncate text-sm font-medium text-slate-200">
													{c.issuer} · {c.accountName}
												</p>
												<p className="truncate font-mono text-[11px] text-slate-500">{c.secret.slice(0, 8)}… · {c.algorithm} · {c.digits}d · {c.period}s</p>
											</div>
											<span
												className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${isDup ? "bg-amber-500/15 text-amber-300 border border-amber-500/20" : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"}`}
											>
												{isDup ? "Duplicate" : "New"}
											</span>
										</div>
									);
								})}
							</div>
						)}

						{activePreview.errors.length > 0 && (
							<div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.08] p-3">
								<p className="text-xs font-medium text-red-300">Invalid entries</p>
								<ul className="mt-1 space-y-1">
									{activePreview.errors.slice(0, 5).map((e, i) => (
										<li key={i} className="truncate text-[11px] text-red-400/80">
											{e.raw.slice(0, 60)} — {e.reason}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>

					{/* Migration strategy */}
					<div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
						<h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
							<ShieldCheck className="h-4 w-4 text-indigo-400" /> Migration strategy
						</h4>
						<p className="mt-1 text-xs text-slate-500">How should duplicates be handled? Nothing leaves this device.</p>
						<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
							<label
								className={`cursor-pointer rounded-xl border p-4 transition-all ${strategy === "merge" ? "border-indigo-500/40 bg-indigo-500/[0.08]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]"}`}
							>
								<input type="radio" name="strategy" value="merge" checked={strategy === "merge"} onChange={() => setStrategy("merge")} className="sr-only" />
								<p className="text-sm font-semibold text-slate-200">Merge — skip duplicates</p>
								<p className="mt-1 text-xs leading-relaxed text-slate-500">Keep existing vault, add {totalUniques} new account{totalUniques === 1 ? "" : "s"}. Duplicates are ignored.</p>
							</label>
							<label
								className={`cursor-pointer rounded-xl border p-4 transition-all ${strategy === "replace" ? "border-amber-500/40 bg-amber-500/[0.08]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]"}`}
							>
								<input type="radio" name="strategy" value="replace" checked={strategy === "replace"} onChange={() => setStrategy("replace")} className="sr-only" />
								<p className="text-sm font-semibold text-slate-200">Replace vault</p>
								<p className="mt-1 text-xs leading-relaxed text-slate-500">
									Replace entire vault with {totalValid} imported account{totalValid === 1 ? "" : "s"}. Existing data will be overwritten.
								</p>
							</label>
						</div>
						{totalDuplicates > 0 && strategy === "merge" && (
							<p className="mt-3 flex items-start gap-2 text-xs text-amber-400/80">
								<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {totalDuplicates} duplicate{totalDuplicates === 1 ? "" : "s"} will be skipped.
							</p>
						)}
					</div>

					{error && <p className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-xs text-red-400">{error}</p>}

					<div className="flex items-center justify-between gap-3">
						<button onClick={() => setStep("source")} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06]">
							Back
						</button>
						<button
							onClick={handleConfirmImport}
							disabled={importing || (strategy === "merge" && totalUniques === 0 && totalDuplicates > 0)}
							className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{importing ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" /> Importing…
								</>
							) : strategy === "replace" ? (
								<>Replace vault ({totalValid})</>
							) : (
								<>Import {totalUniques} account{totalUniques === 1 ? "" : "s"}</>
							)}
						</button>
					</div>
				</div>
			)}

			{step === "confirm" && (
				<div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-10 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
						<Check className="h-7 w-7 text-emerald-400" />
					</div>
					<h3 className="mt-4 text-base font-semibold text-emerald-100">Import complete</h3>
					<p className="mt-1 max-w-sm text-xs leading-relaxed text-emerald-300/70">
						{strategy === "replace"
							? `Vault replaced with ${totalValid} account${totalValid === 1 ? "" : "s"}.`
							: `${totalUniques} new account${totalUniques === 1 ? "" : "s"} added${totalDuplicates > 0 ? `, ${totalDuplicates} duplicate${totalDuplicates === 1 ? "" : "s"} skipped` : ""}.`}
					</p>
					{onClose ? (
						<button onClick={onClose} className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
							Done
						</button>
					) : (
						<button onClick={() => { setStep("source"); setOtpauthInput(""); setJsonText(null); setJsonFileName(null); }} className="mt-6 rounded-xl bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.08]">
							Import more
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export default ImportWizard;
