import type { ReactNode } from "react";

interface EmptyStateProps {
	icon?: ReactNode;
	title: string;
	description: string;
	action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
	return (
		<div
			role="status"
			className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center"
		>
			{icon && (
				<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04]">
					{icon}
				</div>
			)}
			<h3 className="mt-4 text-sm font-semibold text-slate-300">{title}</h3>
			<p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
				{description}
			</p>
			{action && <div className="mt-5">{action}</div>}
		</div>
	);
}
