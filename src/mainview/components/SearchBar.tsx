import { Search, X } from "lucide-react";

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = "Search accounts…" }: SearchBarProps) {
	return (
		<div className="group relative">
			<Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-400" />
			<input
				type="text"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className="w-full rounded-xl border border-white/[0.07] bg-white/[0.03] py-2.5 pl-10 pr-10 text-sm text-slate-200 placeholder:text-slate-600 outline-none backdrop-blur-md transition-all duration-200 focus:border-indigo-500/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px] focus:shadow-indigo-500/10"
			/>
			{value && (
				<button
					onClick={() => onChange("")}
					className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-500 transition-colors hover:text-slate-200"
					aria-label="Clear search"
				>
					<X className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}
