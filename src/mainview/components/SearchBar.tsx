import { Search, X } from "lucide-react";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = "Search accounts…" }: SearchBarProps) {
	return (
		<div className="group relative">
			<Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white transition-colors group-focus-within:text-white" />
			<input
				id="account-search"
				type="text"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				aria-label="Search accounts by issuer or account name"
				aria-keyshortcuts="Control+K Meta+K"
				className="w-full rounded-xl border border-white/[0.03] bg-black py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-slate-500 outline-none backdrop-blur-md transition-all duration-200 focus:border-white/30 focus:bg-black focus:shadow-[0_0_0_3px] focus:shadow-white/20"
			/>
			{value && (
				<button
					onClick={() => onChange("")}
					className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-white transition-colors hover:text-white"
					aria-label="Clear search"
					type="button"
				>
					<X className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}
