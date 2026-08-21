export function formatTrayTitle(count: number): string {
	if (count === 1) return "PR5Auth — 1 account";
	return `PR5Auth — ${count} accounts`;
}

export type TrayAction = "open" | "lock" | "quit";

export interface TrayMenuItem {
	type: "normal" | "divider" | "separator";
	label?: string;
	action?: TrayAction | string;
	enabled?: boolean;
	checked?: boolean;
	hidden?: boolean;
	tooltip?: string;
}

export function buildTrayMenu(): TrayMenuItem[] {
	return [
		{ type: "normal", label: "Open PR5Auth", action: "open" },
		{ type: "normal", label: "Lock Vault", action: "lock" },
		{ type: "divider" },
		{ type: "normal", label: "Quit", action: "quit" },
	];
}

export function parseTrayAction(action: string): TrayAction | null {
	if (action === "open" || action === "lock" || action === "quit") return action;
	return null;
}
