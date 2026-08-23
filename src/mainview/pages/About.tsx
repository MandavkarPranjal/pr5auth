import { ShieldCheck, Sparkles } from "lucide-react";
import { APP_VERSION } from "../constants";

export function About() {
	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<header className="pb-6">
				<h2 className="text-2xl font-semibold tracking-tight text-white">About PR5Auth</h2>
				<p className="mt-0.5 text-sm text-white">A private, local-first home for your authenticator codes</p>
			</header>
			<div className="max-w-2xl space-y-5">
				<section className="rounded-2xl border border-white/[0.03] bg-black/[0.02] p-6 backdrop-blur-xl">
					<div className="flex items-start gap-4">
						<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
							<ShieldCheck className="h-7 w-7 text-white" aria-hidden="true" />
						</div>
						<div>
							<h3 className="text-lg font-semibold text-white">PR5<span className="text-neutral-300">Auth</span></h3>
							<p className="mt-1 text-sm leading-relaxed text-slate-400">Offline-first TOTP authentication for your desktop. Your secrets remain encrypted and stored on this device.</p>
						</div>
					</div>
					<div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
						{[["Version", APP_VERSION], ["Privacy", "Local only"], ["License", "Open source"]].map(([label, value]) => (
							<div key={label} className="rounded-xl border border-white/[0.03] bg-black/[0.03] p-3">
								<p className="text-[10px] font-semibold uppercase tracking-wider text-white">{label}</p>
								<p className="mt-1 text-sm font-medium text-slate-400">{value}</p>
							</div>
						))}
					</div>
				</section>
				<section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
					<h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-white" /> v1 highlights</h3>
					<ul className="mt-4 grid gap-3 text-sm text-slate-500 sm:grid-cols-2">
						{["Encrypted local vault", "QR and URI imports", "Keyboard-friendly controls", "Accessible loading and error states", "Fast account search", "System tray support"].map((item) => <li key={item} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />{item}</li>)}
					</ul>
				</section>
				<p className="text-xs text-slate-600">Built with React, TypeScript and Electrobun</p>
			</div>
		</div>
	);
}
