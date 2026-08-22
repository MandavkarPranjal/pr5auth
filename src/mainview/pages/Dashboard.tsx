import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Account } from "../types/account";
import { AccountCard } from "../components/AccountCard";
import { SearchBar } from "../components/SearchBar";
import { findAccounts } from "../services/accountService";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { EmptyState } from "../components/EmptyState";

interface DashboardProps {
	accounts: Account[];
	onAdd: () => void;
	onDelete: (id: string) => void;
	onCopy: (account: Account, code: string) => void;
}

export function Dashboard({ accounts, onAdd, onDelete, onCopy }: DashboardProps) {
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebouncedValue(query, 160);
	const visible = useMemo(() => findAccounts(accounts, debouncedQuery), [accounts, debouncedQuery]);

	return (
		<div className="flex h-full flex-col">
			<header className="flex flex-wrap items-center justify-between gap-4 pb-6">
				<div>
					<h2 className="text-2xl font-semibold tracking-tight text-white">
						Authenticator
					</h2>
					<p className="mt-0.5 text-sm text-slate-500">
						{visible.length} account{visible.length === 1 ? "" : "s"} · codes refresh automatically
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
				<EmptyState
					variant={query ? "no-results" : "no-accounts"}
					action={!query ? { label: "Add account", onClick: onAdd, icon: <Plus className="h-4 w-4" aria-hidden="true" /> } : undefined}
				/>
			)}
		</div>
	);
}
