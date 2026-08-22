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
		ring: "border-black/25 text-white",
		text: "text-white",
	},
	error: {
		icon: XCircle,
		ring: "border-black/25 text-red-300",
		text: "text-red-300",
	},
	info: {
		icon: Info,
		ring: "border-black/25 text-white",
		text: "text-white",
	},
};

export function Toast({ items }: ToastProps) {
	return (
		<div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
			{items.map((item) => {
				const style = STYLES[item.kind];
				const Icon = style.icon;
				return (
					<div
						key={item.id}
						className={`animate-toast-in pointer-events-auto flex items-center gap-2.5 rounded-xl border ${style.ring} bg-[#151823]/95 px-4 py-2.5 shadow-xl shadow-black/50 backdrop-blur-xl`}
						role="status"
					>
						<Icon className="h-4 w-4 shrink-0" />
						<span className={`text-sm font-medium ${style.text}`}>{item.message}</span>
					</div>
				);
			})}
		</div>
	);
}
