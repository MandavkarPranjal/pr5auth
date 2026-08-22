interface ToggleProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description?: string;
	disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={`group flex w-full items-center justify-between gap-6 rounded-xl px-4 py-3.5 text-left transition-colors ${
				disabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/[0.02]"
			}`}
		>
			<span className="min-w-0">
				<span className="block text-sm font-medium text-slate-200">{label}</span>
				{description && (
					<span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
						{description}
					</span>
				)}
			</span>
			<span
				className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300 ${
					checked ? "bg-indigo-600" : "bg-white/[0.09]"
				}`}
			>
				<span
					className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform duration-300 ${
						checked ? "translate-x-[22px]" : "translate-x-[3px]"
					}`}
				/>
			</span>
		</button>
	);
}
