import { useRef, useState, type DragEvent } from "react";
import { Check, ImageUp, Link2, Loader2, X } from "lucide-react";
import { parseOtpauthUri } from "../services/accountService";
import { decodeQrFromFile } from "../services/qr";

interface ImportQRProps {
	onAddParsed: (uri: string) => boolean;
	onOpenModal: (prefill: { issuer: string; accountName: string; secret: string }) => void;
}

export function ImportQR({ onAddParsed, onOpenModal }: ImportQRProps) {
	const [urlInput, setUrlInput] = useState("");
	const [dragOver, setDragOver] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [imageError, setImageError] = useState<string | null>(null);
	const [urlError, setUrlError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const parsedUrl = urlInput.trim() ? parseOtpauthUri(urlInput) : null;

	async function handleImageFile(file: File | undefined | null) {
		if (!file) return;
		setImageError(null);
		setScanning(true);
		try {
			const raw = await decodeQrFromFile(file);
			if (!raw) {
				setImageError("No QR code found in this image.");
				return;
			}
			if (!onAddParsed(raw)) {
				setImageError("The QR code does not contain a valid otpauth:// URI.");
			}
		} catch {
			setImageError("Could not read this image. Try a clearer photo.");
		} finally {
			setScanning(false);
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		setDragOver(false);
		void handleImageFile(event.dataTransfer.files?.[0]);
	}

	function handleUrlSubmit() {
		setUrlError(null);
		if (!urlInput.trim()) {
			setUrlError("Paste an otpauth:// URI first.");
			return;
		}
		const parsed = parseOtpauthUri(urlInput);
		if (!parsed) {
			setUrlError("Invalid otpauth:// URI. It should look like otpauth://totp/Issuer:user?secret=…");
			return;
		}
		onOpenModal({ issuer: parsed.issuer, accountName: parsed.accountName, secret: parsed.secret });
	}

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<header className="pb-6">
				<h2 className="text-2xl font-semibold tracking-tight text-white">Import QR</h2>
				<p className="mt-0.5 text-sm text-slate-500">
					Add accounts from a QR code image or an otpauth:// link
				</p>
			</header>

			<div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
				<section className="space-y-6">
					<div
						onDragOver={(event) => {
							event.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
						onDrop={handleDrop}
						onClick={() => fileInputRef.current?.click()}
						className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center transition-all duration-300 ${
							dragOver
								? "border-white/40 bg-white/[0.06]"
								: "border-white/[0.1] bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
						}`}
					>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={(event) => {
								void handleImageFile(event.target.files?.[0]);
								event.target.value = "";
							}}
						/>
						{scanning ? (
							<>
								<Loader2 className="h-10 w-10 animate-spin text-neutral-300" />
								<p className="mt-4 text-sm font-medium text-slate-300">
									Scanning QR code…
								</p>
							</>
						) : (
							<>
								<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
									<ImageUp className="h-6 w-6 text-neutral-300" />
								</div>
								<p className="mt-4 text-sm font-medium text-slate-200">
									Upload a QR code image
								</p>
								<p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
									Drop an image here or click to browse. PNG, JPEG and WebP are
									supported.
								</p>
							</>
						)}
					</div>

					{imageError && (
						<p className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-xs text-red-400">
							<X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							{imageError}
						</p>
					)}
				</section>

				<section className="space-y-6">
					<div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
						<div className="mb-3 flex items-center gap-2.5">
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
								<Link2 className="h-4 w-4 text-slate-400" />
							</div>
							<h3 className="text-sm font-semibold text-slate-200">
								Paste otpauth:// URI
							</h3>
						</div>
						<textarea
							value={urlInput}
							onChange={(event) => {
								setUrlInput(event.target.value);
								setUrlError(null);
							}}
							rows={4}
							placeholder="otpauth://totp/GitHub:dev@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
							className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 font-mono text-xs leading-relaxed text-slate-300 placeholder:text-slate-600 outline-none transition-all focus:border-white/30 focus:shadow-[0_0_0_3px] focus:shadow-white/10"
						/>
						{urlError && (
							<p className="mt-2 text-xs text-red-400">{urlError}</p>
						)}

						{parsedUrl && (
							<div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
								<div className="min-w-0">
									<p className="truncate text-sm font-medium text-emerald-200">
										{parsedUrl.issuer} · {parsedUrl.accountName}
									</p>
									<p className="mt-0.5 text-[11px] text-emerald-400/70">
										{parsedUrl.algorithm} · {parsedUrl.digits} digits ·{" "}
										{parsedUrl.period}s period
									</p>
								</div>
								<button
									onClick={handleUrlSubmit}
									className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.97]"
								>
									<Check className="h-3.5 w-3.5" />
									Add
								</button>
							</div>
						)}

						{!parsedUrl && urlInput.trim() && (
							<p className="mt-2 text-xs text-amber-400/80">
								Waiting for a valid otpauth:// URI…
							</p>
						)}
					</div>

					<div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-xs leading-relaxed text-slate-500">
						<p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
							How it works
						</p>
						<ul className="mt-2.5 space-y-1.5">
							<li>1 · QR images are decoded fully offline on your device.</li>
							<li>2 · The otpauth:// URI is parsed for secret, issuer and settings.</li>
							<li>3 · Accounts are stored in the local vault only.</li>
							<li>4 · Nothing ever leaves this machine.</li>
						</ul>
					</div>
				</section>
			</div>
		</div>
	);
}
