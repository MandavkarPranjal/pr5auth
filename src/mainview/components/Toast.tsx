import { CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
	id: string;
	kind: ToastKind;
	message: string;
}

interface ToastProps {
	items: ToastItem[];
}

const STYLES: Record<ToastKind, { icon: typeof Info; ring: string; text: string }> = {
	success: {
		icon: CheckCircle2,
		ring: "border-emerald-500/25 text-emerald-300",
		text: "text-emerald-100",
	},
	error: {
		icon: XCircle,
		ring: "border-red-500/25 text-red-300",
		text: "text-red-100",
	},
	info: {
		icon: Info,
		ring: "border-indigo-500/25 text-indigo-300",
		text: "text-slate-100",
	},
};

export function Toast({ items, onDismiss }: ToastProps & { onDismiss?: (id: string) => void }) {
	return (
		<div
			aria-live="polite"
			aria-atomic="false"
			className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
		>
			{items.map((item) => {
				const style = STYLES[item.kind];
				const Icon = style.icon;
				return (
					<div
						key={item.id}
						className={`animate-toast-in pointer-events-auto flex items-center gap-2.5 rounded-xl border ${style.ring} bg-[#151823]/95 px-4 py-2.5 shadow-xl shadow-black/50 backdrop-blur-xl`}
						role="status"
					>
						<Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
						<span className={`text-sm font-medium ${style.text}`}>{item.message}</span>
						{onDismiss && (
							<button
								onClick={() => onDismiss(item.id)}
								aria-label="Dismiss notification"
								className="ml-1 rounded p-1 opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
							>
								<span aria-hidden="true">×</span>
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}
