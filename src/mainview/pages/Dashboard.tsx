import { useMemo, useState } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import type { Account } from "../types/account";
import { AccountCard } from "../components/AccountCard";
import { SearchBar } from "../components/SearchBar";
import { findAccounts } from "../services/accountService";

interface DashboardProps {
	accounts: Account[];
	onAdd: () => void;
	onDelete: (id: string) => void;
	onCopy: (account: Account, code: string) => void;
}

export function Dashboard({ accounts, onAdd, onDelete, onCopy }: DashboardProps) {
	const [query, setQuery] = useState("");
	const visible = useMemo(() => findAccounts(accounts, query), [accounts, query]);

	return (
		<div className="flex h-full flex-col">
			<header className="flex flex-wrap items-center justify-between gap-4 pb-6">
				<div>
					<h2 className="text-2xl font-semibold tracking-tight text-white">
						Authenticator
					</h2>
					<p className="mt-0.5 text-sm text-slate-500">
						{visible.length} account{visible.length === 1 ? "" : "s"} · codes refresh
						every 30s
					</p>
				</div>
				<div className="flex items-center gap-3">
					<div className="w-64">
						<SearchBar value={query} onChange={setQuery} />
					</div>
					<button
						onClick={onAdd}
						className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all duration-200 hover:bg-indigo-500 active:scale-[0.98]"
					>
						<Plus className="h-4 w-4" />
						Add account
					</button>
				</div>
			</header>

			{visible.length > 0 ? (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
					{visible.map((account) => (
						<AccountCard
							key={account.id}
							account={account}
							onDelete={onDelete}
							onCopy={onCopy}
						/>
					))}
				</div>
			) : (
				<div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04]">
						{query ? (
							<ShieldAlert className="h-6 w-6 text-slate-600" />
						) : (
							<Plus className="h-6 w-6 text-slate-600" />
						)}
					</div>
					<h3 className="mt-4 text-sm font-semibold text-slate-300">
						{query ? "No matching accounts" : "No accounts yet"}
					</h3>
					<p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
						{query
							? "Try a different search term, or clear the search."
							: "Add your first authenticator account or import a QR code to get started."}
					</p>
					{!query && (
						<button
							onClick={onAdd}
							className="mt-5 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all duration-200 hover:bg-indigo-500 active:scale-[0.98]"
						>
							<Plus className="h-4 w-4" />
							Add account
						</button>
					)}
				</div>
			)}
		</div>
	);
}
