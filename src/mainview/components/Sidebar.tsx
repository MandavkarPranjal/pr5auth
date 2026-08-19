import { LayoutGrid, QrCode, Settings, ShieldCheck } from "lucide-react";
import type { Page } from "../types/account";

interface SidebarProps {
	page: Page;
	onNavigate: (page: Page) => void;
	accountCount: number;
	locked: boolean;
}

const NAV_ITEMS: { page: Page; label: string; icon: typeof LayoutGrid }[] = [
	{ page: "dashboard", label: "Authenticator", icon: LayoutGrid },
	{ page: "import", label: "Import QR", icon: QrCode },
	{ page: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ page, onNavigate, accountCount, locked }: SidebarProps) {
	return (
		<aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0B0E16]/80 backdrop-blur-xl">
			<div className="flex items-center gap-3 px-5 pt-6 pb-8">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-950/60">
					<ShieldCheck className="h-5 w-5 text-white" />
				</div>
				<div>
					<h1 className="text-lg font-semibold tracking-tight text-white">
						PR5<span className="text-indigo-400">Auth</span>
					</h1>
					<p className="text-[11px] font-medium tracking-wide text-slate-500">
						OFFLINE AUTHENTICATOR
					</p>
				</div>
			</div>

			<nav className="flex flex-1 flex-col gap-1 px-3">
				{NAV_ITEMS.map((item) => {
					const Icon = item.icon;
					const active = page === item.page;
					return (
						<button
							key={item.page}
							onClick={() => onNavigate(item.page)}
							className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
								active
									? "bg-indigo-500/15 text-indigo-300 shadow-inner shadow-indigo-950/40"
									: "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
							}`}
						>
							<Icon
								className={`h-[18px] w-[18px] transition-colors ${
									active
										? "text-indigo-400"
										: "text-slate-500 group-hover:text-slate-300"
								}`}
							/>
							<span>{item.label}</span>
							{item.page === "dashboard" && (
								<span
									className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
										active
											? "bg-indigo-500/20 text-indigo-300"
											: "bg-white/[0.06] text-slate-500"
									}`}
								>
									{accountCount}
								</span>
							)}
						</button>
					);
				})}
			</nav>

			<div className="space-y-3 px-3 pb-5">
				<div className="flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.07] px-3 py-2">
					<span
						className={`h-2 w-2 rounded-full ${
							locked ? "bg-amber-400" : "bg-emerald-400"
						} shadow-[0_0_8px] shadow-emerald-400/60`}
					/>
					<span className="text-[11px] font-medium text-emerald-200/90">
						{locked ? "Locked" : "Vault secured"}
					</span>
				</div>
				<p className="px-1 text-[10px] font-medium tracking-wider text-slate-600">
					PR5AUTH v0.1.0 · LOCAL ONLY
				</p>
			</div>
		</aside>
	);
}
