import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, X } from "lucide-react";
import type { AddAccountInput } from "../types/account";
import { isValidSecret, normalizeSecret } from "../services/accountService";

interface AddAccountModalProps {
	open: boolean;
	initial?: Partial<AddAccountInput>;
	onSave: (input: AddAccountInput) => void;
	onCancel: () => void;
}

export function AddAccountModal({ open, initial, onSave, onCancel }: AddAccountModalProps) {
	const [issuer, setIssuer] = useState("");
	const [accountName, setAccountName] = useState("");
	const [secret, setSecret] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setIssuer(initial?.issuer ?? "");
			setAccountName(initial?.accountName ?? "");
			setSecret(initial?.secret ?? "");
			setError(null);
		}
	}, [open, initial]);

	if (!open) return null;

	function handleSubmit(event: FormEvent) {
		event.preventDefault();

		if (!issuer.trim()) {
			setError("Issuer name is required.");
			return;
		}
		if (!secret.trim()) {
			setError("Secret key is required.");
			return;
		}
		if (!isValidSecret(normalizeSecret(secret))) {
			setError("Secret key must be a valid Base32 string (A–Z, 2–7) of at least 16 characters.");
			return;
		}

		onSave({
			issuer: issuer.trim(),
			accountName: accountName.trim(),
			secret: normalizeSecret(secret),
		});
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			onClick={onCancel}
		>
			<div
				className="animate-modal-in w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#12151F]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl"
				onClick={(event) => event.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Add account"
			>
				<div className="mb-6 flex items-start justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
							<KeyRound className="h-5 w-5 text-neutral-300" />
						</div>
						<div>
							<h2 className="text-base font-semibold text-white">Add account</h2>
							<p className="text-xs text-slate-500">
								Store a new TOTP secret locally
							</p>
						</div>
					</div>
					<button
						onClick={onCancel}
						className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<label className="block">
						<span className="mb-1.5 block text-xs font-medium text-slate-400">
							Issuer name
						</span>
						<input
							type="text"
							value={issuer}
							onChange={(event) => setIssuer(event.target.value)}
							placeholder="e.g. GitHub"
							autoFocus
							className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-all focus:border-white/30 focus:shadow-[0_0_0_3px] focus:shadow-white/10"
						/>
					</label>

					<label className="block">
						<span className="mb-1.5 block text-xs font-medium text-slate-400">
							Account name
						</span>
						<input
							type="text"
							value={accountName}
							onChange={(event) => setAccountName(event.target.value)}
							placeholder="e.g. dev@example.com"
							className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-all focus:border-white/30 focus:shadow-[0_0_0_3px] focus:shadow-white/10"
						/>
					</label>

					<label className="block">
						<span className="mb-1.5 block text-xs font-medium text-slate-400">
							Secret key
						</span>
						<input
							type="password"
							value={secret}
							onChange={(event) => setSecret(event.target.value)}
							placeholder="Base32 secret, e.g. JBSWY3DPEHPK3PXP"
							className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 font-mono text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-all focus:border-white/30 focus:shadow-[0_0_0_3px] focus:shadow-white/10"
						/>
					</label>

					{error && (
						<p className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-400">
							{error}
						</p>
					)}

					<div className="flex justify-end gap-3 pt-2">
						<button
							type="button"
							onClick={onCancel}
							className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
						>
							Cancel
						</button>
						<button
							type="submit"
							className="rounded-xl bg-white text-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-200  active:scale-[0.98]"
						>
							Save account
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
