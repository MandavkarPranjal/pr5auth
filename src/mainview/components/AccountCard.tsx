import { memo, useCallback, useState } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import type { Account } from "../types/account";
import { useTotp } from "../hooks/useTotp";
import { CountdownRing } from "./CountdownRing";

function highlightMatch(text: string, query: string): React.ReactNode {
	if (!query.trim()) return text;
	const q = query.trim().toLowerCase();
	const idx = text.toLowerCase().indexOf(q);
	if (idx === -1) return text;
	return (
		<>
			{text.slice(0, idx)}
			<mark className="rounded bg-indigo-500/30 px-0.5 text-indigo-200">{text.slice(idx, idx + q.length)}</mark>
			{text.slice(idx + q.length)}
		</>
	);
}

const GRADIENTS = [
	"from-indigo-500 to-violet-600",
	"from-sky-500 to-cyan-600",
	"from-emerald-500 to-teal-600",
	"from-rose-500 to-pink-600",
	"from-amber-500 to-orange-600",
	"from-fuchsia-500 to-purple-600",
];

function gradientFor(issuer: string): string {
	let hash = 0;
	for (let i = 0; i < issuer.length; i++) {
		hash = (hash * 31 + issuer.charCodeAt(i)) >>> 0;
	}
	return GRADIENTS[hash % GRADIENTS.length];
}

function initialsFor(issuer: string): string {
	return issuer.slice(0, 2).toUpperCase() || "?";
}

interface AccountCardProps {
	account: Account;
	onDelete: (id: string) => void;
	onCopy: (account: Account, code: string) => void;
	searchQuery?: string;
}

export const AccountCard = memo(function AccountCard({ account, onDelete, onCopy, searchQuery = "" }: AccountCardProps) {
	const { code, remaining, progress, isValid } = useTotp(account);
	const [copied, setCopied] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const handleCopy = useCallback(() => {
		if (!isValid) return;
		onCopy(account, code);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1800);
	}, [account, code, isValid, onCopy]);

	const handleDelete = useCallback(() => {
		if (!confirmDelete) {
			setConfirmDelete(true);
			window.setTimeout(() => setConfirmDelete(false), 3000);
			return;
		}
		onDelete(account.id);
	}, [account.id, confirmDelete, onDelete]);

	return (
		<div
			role="button"
			tabIndex={0}
			aria-label={`Copy code for ${account.issuer} ${account.accountName}`}
			onClick={handleCopy}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleCopy();
				}
			}}
			className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500/30 hover:bg-white/[0.05] hover:shadow-xl hover:shadow-indigo-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
		>
			<div
				className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
			/>

			<div className="flex items-start gap-4">
				<div
					className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradientFor(
						account.issuer,
					)} text-sm font-bold text-white shadow-lg`}
				>
					{initialsFor(account.issuer)}
				</div>

				<div className="min-w-0 flex-1">
					<h3 className="truncate text-sm font-semibold text-slate-100">
						{highlightMatch(account.issuer, searchQuery)}
					</h3>
					<p className="truncate text-xs text-slate-500">{highlightMatch(account.accountName, searchQuery)}</p>
				</div>

				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							handleCopy();
						}}
						title={copied ? "Copied!" : "Copy code"}
						aria-label={copied ? "Copied" : `Copy code for ${account.issuer}`}
						className="rounded-lg p-2 text-slate-500 transition-all duration-200 hover:bg-white/[0.06] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
					>
						{copied ? (
							<Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
						) : (
							<Copy className="h-4 w-4" aria-hidden="true" />
						)}
					</button>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							handleDelete();
						}}
						title={confirmDelete ? "Click again to confirm" : "Delete account"}
						aria-label={confirmDelete ? "Click again to confirm delete" : `Delete ${account.issuer}`}
						className={`rounded-lg p-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 ${
							confirmDelete
								? "bg-red-500/15 text-red-400"
								: "text-slate-600 hover:bg-white/[0.06] hover:text-red-400"
						}`}
					>
						{confirmDelete ? (
							<KeyRound className="h-4 w-4" aria-hidden="true" />
						) : (
							<Trash2 className="h-4 w-4" aria-hidden="true" />
						)}
					</button>
				</div>
			</div>

			<div className="mt-4 flex items-end justify-between gap-4">
				<div>
					<p className="text-[10px] font-medium uppercase tracking-widest text-slate-600">
						Current code
					</p>
					<p
						className={`mt-1 font-mono text-[28px] font-semibold leading-none tracking-[0.2em] tabular-nums ${
							isValid ? "text-slate-50" : "text-slate-600"
						}`}
					>
						{code}
					</p>
				</div>

				<div className="flex flex-col items-center gap-1.5">
					<CountdownRing progress={progress} seconds={remaining} />
					<span className="text-[10px] font-medium uppercase tracking-wider text-slate-600">
						{remaining}s
					</span>
				</div>
			</div>
		</div>
	);
});
