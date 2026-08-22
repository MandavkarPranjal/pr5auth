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
			className="empty-state flex flex-1 flex-col items-center justify-center rounded-xl border border-white/[0.03] bg-black/[0.02] p-8 text-center"
		>
			<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/[0.03]" aria-hidden="true">
				{icon ?? <Icon className="h-5 w-5 text-slate-500" />}
			</div>
			<h3 className="mt-3 text-sm font-semibold text-white">{title ?? config.title}</h3>
			<p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">{description ?? config.description}</p>
			{(action || secondaryAction) && (
				<div className="mt-5 flex items-center gap-3">
					{action && (
						<button
							type="button"
							onClick={action.onClick}
							className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-neutral-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
						>
							{action.icon ?? <Plus className="h-4 w-4" aria-hidden="true" />}
							{action.label}
						</button>
					)}
					{secondaryAction && (
						<button
							type="button"
							onClick={secondaryAction.onClick}
							className="rounded-xl border border-white/[0.03] bg-black px-4 py-2.5 text-sm font-medium text-slate-400 rounded-xl hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
						>
							{secondaryAction.label}
						</button>
					)}
				</div>
			)}
		</div>
	);
}
