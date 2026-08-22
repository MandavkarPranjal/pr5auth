import type { ReactNode } from "react";
import { Plus, SearchX, ShieldAlert, Inbox } from "lucide-react";

export type EmptyVariant = "no-accounts" | "no-results" | "no-import" | "generic";

interface EmptyStateProps {
	variant?: EmptyVariant;
	title?: string;
	description?: string;
	icon?: ReactNode;
	action?: { label: string; onClick: () => void; icon?: ReactNode };
	secondaryAction?: { label: string; onClick: () => void };
}

const VARIANT_CONFIG: Record<EmptyVariant, { icon: typeof ShieldAlert; title: string; description: string }> = {
	"no-accounts": {
		icon: ShieldAlert,
		title: "No accounts yet",
		description: "Add your first authenticator account or import a QR code to get started. Your secrets stay local — nothing ever leaves this device.",
	},
	"no-results": {
		icon: SearchX,
		title: "No matching accounts",
		description: "Try a different search term, or clear the search to see all accounts.",
	},
	"no-import": {
		icon: Inbox,
		title: "Nothing to import",
		description: "Paste otpauth:// URIs or upload a QR code image to import accounts.",
	},
	generic: {
		icon: Inbox,
		title: "Nothing here yet",
		description: "There is no data to display.",
	},
};

export function EmptyState({
	variant = "generic",
	title,
	description,
	icon,
	action,
	secondaryAction,
}: EmptyStateProps) {
	const config = VARIANT_CONFIG[variant];
	const Icon = config.icon;

	return (
		<div
			role="status"
			aria-live="polite"
			className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center"
		>
			<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04]" aria-hidden="true">
				{icon ?? <Icon className="h-6 w-6 text-slate-600" />}
			</div>
			<h3 className="mt-4 text-sm font-semibold text-slate-300">{title ?? config.title}</h3>
			<p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">{description ?? config.description}</p>
			{(action || secondaryAction) && (
				<div className="mt-5 flex items-center gap-3">
					{action && (
						<button
							type="button"
							onClick={action.onClick}
							className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all duration-200 hover:bg-indigo-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
						>
							{action.icon ?? <Plus className="h-4 w-4" aria-hidden="true" />}
							{action.label}
						</button>
					)}
					{secondaryAction && (
						<button
							type="button"
							onClick={secondaryAction.onClick}
							className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
						>
							{secondaryAction.label}
						</button>
					)}
				</div>
			)}
		</div>
	);
}
