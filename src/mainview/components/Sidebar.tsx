import { Info, LayoutGrid, QrCode, Settings, ShieldCheck } from "lucide-react";
import type { Page } from "../types/account";
import { APP_VERSION } from "../constants";
import { useLiveVersion } from "../hooks/useUpdateState";

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
	{ page: "about", label: "About", icon: Info },
];

export function Sidebar({ page, onNavigate, accountCount, locked }: SidebarProps) {
	const liveVersionRaw = useLiveVersion();
	const liveVersion = liveVersionRaw || APP_VERSION;
	return (
		<aside className="app-sidebar flex h-full w-60 shrink-0 flex-col border-r border-white/[0.03] bg-black">
			<div className="flex items-center gap-3 px-5 pt-6 pb-8">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
					<ShieldCheck className="h-5 w-5 text-zinc-900" />
				</div>
				<div>
					<h1 className="text-lg font-semibold tracking-tight text-white">
						PR5<span className="text-neutral-300">Auth</span>
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
							className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
								active
									? "bg-black text-white"
									: "text-slate-400 hover:bg-white/[0.03] hover:text-white"
							}`}
							aria-current={active ? "page" : undefined}
							aria-label={item.label}
						>
							<Icon
								className={`h-[16px] w-[16px] transition-colors ${
									active
										? "text-white"
										: "text-slate-400 group-hover:text-white"
								}`}
							/>
							<span>{item.label}</span>
							{item.page === "dashboard" && (
								<span
									className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
										active
											? "bg-white/10 text-neutral-200"
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
				<div className="flex items-center gap-2 rounded-lg border border-white/[0.03] px-3 py-2">
					<span
						className={`h-2 w-2 rounded-full ${
							locked ? "bg-red-400" : "bg-green-400"
						}`}
					/>
					<span className="text-[11px] font-medium text-slate-400">
						{locked ? "Locked" : "Vault secured"}
					</span>
				</div>
				<p className="px-1 text-[10px] font-medium text-slate-400">
					PR5AUTH v{liveVersion} · LOCAL ONLY
				</p>
				<p className="px-1 text-[10px] text-slate-500">Shortcuts: ⌘/Ctrl K search · N add</p>
			</div>
		</aside>
	);
}
