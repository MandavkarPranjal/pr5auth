import { ShieldCheck, Lock, HardDrive, Zap, ExternalLink } from "lucide-react";

const APP_VERSION = "1.0.0";

export function About() {
	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<header className="pb-6">
				<h2 className="text-2xl font-semibold tracking-tight text-white">About</h2>
				<p className="mt-0.5 text-sm text-slate-500">PR5Auth v{APP_VERSION} — offline-first authenticator</p>
			</header>

			<div className="max-w-2xl space-y-5">
				<section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 backdrop-blur-xl">
					<div className="flex items-start gap-4">
						<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-950/60">
							<ShieldCheck className="h-6 w-6 text-white" />
						</div>
						<div>
							<h3 className="text-base font-semibold text-white">PR5Auth</h3>
							<p className="mt-1 text-xs leading-relaxed text-slate-500">
								A modern, offline-first desktop TOTP authenticator. Your secrets are stored
								locally on this device with AES-256-GCM encryption and Argon2id key
								derivation. Nothing is ever sent to the cloud.
							</p>
							<div className="mt-3 flex flex-wrap gap-2 text-[11px]">
								<span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-medium tabular-nums text-slate-400">
									Version {APP_VERSION}
								</span>
								<span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-1 font-medium text-emerald-300">
									No cloud · No account
								</span>
							</div>
						</div>
					</div>
				</section>

				<section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					{[
						{ icon: Lock, title: "Encrypted", desc: "AES-256-GCM + Argon2id" },
						{ icon: HardDrive, title: "Offline-first", desc: "No network required" },
						{ icon: Zap, title: "Fast", desc: "Instant TOTP generation" },
					].map(({ icon: Icon, title, desc }) => (
						<div
							key={title}
							className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-center"
						>
							<Icon className="mx-auto h-5 w-5 text-indigo-400" />
							<p className="mt-2 text-sm font-medium text-slate-200">{title}</p>
							<p className="mt-1 text-xs text-slate-500">{desc}</p>
						</div>
					))}
				</section>

				<section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
					<h4 className="text-sm font-semibold text-slate-200">Keyboard shortcuts</h4>
					<dl className="mt-3 space-y-2 text-xs">
						{[
							["⌘/Ctrl + K", "Focus search"],
							["⌘/Ctrl + N", "Add account"],
							["/", "Focus search"],
							["Esc", "Close modal / clear"],
							["1 / 2 / 3", "Navigate pages"],
						].map(([k, v]) => (
							<div key={k} className="flex justify-between">
								<dt className="font-mono text-slate-400">{k}</dt>
								<dd className="text-slate-500">{v}</dd>
							</div>
						))}
					</dl>
				</section>

				<section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
					<h4 className="text-sm font-semibold text-slate-200">Credits</h4>
					<p className="mt-2 text-xs leading-relaxed text-slate-500">
						Built with Electrobun, React, TypeScript, and Tailwind. TOTP via otplib.
						QR decoding via jsQR. Encryption via Node crypto + @noble/hashes.
					</p>
					<a
						href="https://github.com/anomalyco/opencode"
						target="_blank"
						rel="noreferrer"
						className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
					>
						<ExternalLink className="h-3.5 w-3.5" />
						Feedback & issues
					</a>
				</section>
			</div>
		</div>
	);
}
