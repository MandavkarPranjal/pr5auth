import { Lock, ShieldCheck } from "lucide-react";

interface LockScreenProps {
	onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080A10]">
			<div className="animate-modal-in flex flex-col items-center px-6 text-center">
				<div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-2xl shadow-indigo-950/70">
					<Lock className="h-9 w-9 text-white" />
				</div>
				<h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">
					PR5Auth is locked
				</h1>
				<p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
					Your codes are stored locally and safe. Unlock to continue.
				</p>
				<button
					onClick={onUnlock}
					className="mt-8 flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all duration-200 hover:bg-indigo-500 active:scale-[0.98]"
				>
					<ShieldCheck className="h-4 w-4" />
					Unlock vault
				</button>
			</div>
		</div>
	);
}
