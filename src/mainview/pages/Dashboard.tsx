import { useMemo, useState } from "react";
import { Plus, ShieldAlert, SearchX } from "lucide-react";
import type { Account } from "../types/account";
import { AccountCard } from "../components/AccountCard";
import { SearchBar } from "../components/SearchBar";
import { EmptyState } from "../components/EmptyState";
import { findAccounts } from "../services/accountService";
import { useDebouncedValue } from "../hooks/useDebounced";

interface DashboardProps {
	accounts: Account[];
	onAdd: () => void;
	onDelete: (id: string) => void;
	onCopy: (account: Account, code: string) => void;
	searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function Dashboard({ accounts, onAdd, onDelete, onCopy, searchInputRef }: DashboardProps) {
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebouncedValue(query, 150);
	const visible = useMemo(() => findAccounts(accounts, debouncedQuery), [accounts, debouncedQuery]);

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
						<SearchBar
							ref={searchInputRef as React.Ref<HTMLInputElement>}
							value={query}
							onChange={setQuery}
							resultsCount={visible.length}
							totalCount={accounts.length}
						/>
					</div>
					<button
						type="button"
						onClick={onAdd}
						aria-label="Add account (Ctrl+N)"
						className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all duration-200 hover:bg-indigo-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
					>
						<Plus className="h-4 w-4" aria-hidden="true" />
						Add account
					</button>
				</div>
			</header>

			{visible.length > 0 ? (
				<div
					role="list"
					aria-label="Authenticator accounts"
					className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
				>
					{visible.map((account) => (
						<div key={account.id} role="listitem">
							<AccountCard
								account={account}
								onDelete={onDelete}
								onCopy={onCopy}
								searchQuery={debouncedQuery}
							/>
						</div>
					))}
				</div>
			) : query ? (
				<EmptyState
					icon={<SearchX className="h-6 w-6 text-slate-600" aria-hidden="true" />}
					title="No matching accounts"
					description={`No accounts match "${query}". Try a different search term or clear the filter.`}
					action={
						<button
							type="button"
							onClick={() => setQuery("")}
							className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
						>
							Clear search
						</button>
					}
				/>
			) : (
				<EmptyState
					icon={<ShieldAlert className="h-6 w-6 text-slate-600" aria-hidden="true" />}
					title="No accounts yet"
					description="Add your first authenticator account or import from a QR code or JSON backup to get started. Your codes are stored locally and encrypted."
					action={
						<button
							type="button"
							onClick={onAdd}
							className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all duration-200 hover:bg-indigo-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
						>
							<Plus className="h-4 w-4" aria-hidden="true" />
							Add account
						</button>
					}
				/>
			)}
		</div>
	);
}
