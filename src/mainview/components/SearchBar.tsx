import { Search, X } from "lucide-react";
import { forwardRef } from "react";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	resultsCount?: number;
	totalCount?: number;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
	function SearchBar({ value, onChange, placeholder = "Search accounts…", resultsCount, totalCount }, ref) {
		return (
			<div className="group relative">
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-400"
				/>
				<input
					ref={ref}
					type="search"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					aria-label="Search accounts by issuer or name"
					aria-describedby={resultsCount !== undefined ? "search-results-count" : undefined}
					className="w-full rounded-xl border border-white/[0.07] bg-white/[0.03] py-2.5 pl-10 pr-10 text-sm text-slate-200 placeholder:text-slate-600 outline-none backdrop-blur-md transition-all duration-200 focus:border-indigo-500/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px] focus:shadow-indigo-500/10"
				/>
				{value && (
					<button
						type="button"
						onClick={() => onChange("")}
						className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-500 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
						aria-label="Clear search"
					>
						<X className="h-4 w-4" aria-hidden="true" />
					</button>
				)}
				{resultsCount !== undefined && totalCount !== undefined && value && (
					<span id="search-results-count" className="sr-only" aria-live="polite">
						{resultsCount} of {totalCount} accounts shown
					</span>
				)}
			</div>
		);
	},
);
