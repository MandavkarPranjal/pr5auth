import { BrowserView, BrowserWindow, Tray, Updater, Utils } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import type { SecureStorageSchema } from "../shared/rpcSchema";
import { createSecureStorageBackend } from "./secureStorage";
import { buildTrayMenu, formatTrayTitle } from "./tray";
import { SETTINGS_KEY, VAULT_KEY } from "../shared/storageProvider";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const storageBackend = await createSecureStorageBackend();

// Tray state
let accountCount = 0;
let minimizeToTray = false;
let closeToTray = false;
let isForceQuitting = false;
let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let mainViewUrl: string | null = null;

async function loadTraySettings() {
	try {
		const raw = await storageBackend.getItem(SETTINGS_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as {
				minimizeToTray?: boolean;
				closeToTray?: boolean;
			};
			minimizeToTray = Boolean(parsed.minimizeToTray);
			closeToTray = Boolean(parsed.closeToTray);
		}
	} catch {
		// ignore
	}
}

async function loadAccountCount() {
	try {
		const raw = await storageBackend.getItem(VAULT_KEY);
		if (!raw) {
			accountCount = 0;
			return;
		}
		const parsed = JSON.parse(raw) as { accounts?: unknown[] };
		if (Array.isArray(parsed.accounts)) {
			accountCount = parsed.accounts.length;
		} else if (Array.isArray(parsed)) {
			accountCount = (parsed as unknown[]).length;
		} else {
			accountCount = 0;
		}
	} catch {
		// ignore
	}
}

function updateTrayTitle() {
	if (!tray) return;
	tray.setTitle(formatTrayTitle(accountCount));
}

function restoreWindow(): boolean {
	if (mainWindow && (BrowserWindow as unknown as { getById: (id: number) => unknown }).getById(mainWindow.id)) {
		try {
			// If minimized, restore first
			if (mainWindow.isMinimized()) {
				mainWindow.unminimize();
			}
			mainWindow.show();
			mainWindow.activate();
			return false;
		} catch {
			// fall through to recreate
		}
	}
	// Recreate window if it was closed
	if (mainViewUrl) {
		mainWindow = new BrowserWindow({
			title: "PR5Auth",
			url: mainViewUrl,
			rpc,
			frame: {
				width: 1200,
				height: 800,
				x: 200,
				y: 200,
			},
		});
		// Re-attach window event handling for new window if needed
		return true;
	}
	return false;
}

function hideWindow() {
	if (!mainWindow) return;
	try {
		mainWindow.hide();
	} catch {
		// ignore
	}
}

const rpc = BrowserView.defineRPC<SecureStorageSchema>({
	maxRequestTime: 10000,
	handlers: {
		requests: {
			"storage:getItem": async ({ key }) => storageBackend.getItem(key),
			"storage:setItem": async ({ key, value }) =>
				storageBackend.setItem(key, value),
			"storage:removeItem": async ({ key }) => storageBackend.removeItem(key),
			"storage:status": async () => storageBackend.getStatus(),
			"storage:reset": async () => storageBackend.reset(),
			"tray:updateCount": async ({ count }) => {
				accountCount = count;
				updateTrayTitle();
			},
			"tray:updateSettings": async ({ minimizeToTray: mtt, closeToTray: ctt }) => {
				minimizeToTray = mtt;
				closeToTray = ctt;
			},
		},
	},
});

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();
mainViewUrl = url;

mainWindow = new BrowserWindow({
	title: "PR5Auth",
	url,
	rpc,
	frame: {
		width: 1200,
		height: 800,
		x: 200,
		y: 200,
	},
});

// Initialize tray after settings/count are loaded
await loadTraySettings();
await loadAccountCount();

try {
	tray = new Tray({
		title: formatTrayTitle(accountCount),
		image: "views://mainview/tray-icon.png",
		template: true,
		width: 22,
		height: 22,
	});
	tray.setMenu(buildTrayMenu() as unknown as Parameters<Tray["setMenu"]>[0]);

	const handleTrayEvent = (event: unknown) => {
		const data = (event as { data?: { action?: string } })?.data;
		const action = data?.action ?? "";
		// Empty action means tray icon clicked — restore window
		if (action === "" || action === "open") {
			restoreWindow();
			return;
		}
		if (action === "lock") {
			// Restore or recreate the window before dispatching lock so the
			// newly created webview receives the message in a locked state.
			const didRecreate = restoreWindow();
			const sendLock = () => {
				try {
					// Prefer typed RPC message (bun -> webview)
					let sentViaRpc = false;
					if (
						rpc &&
						typeof (rpc as unknown as { send?: unknown }).send === "function"
					) {
						const send = (rpc as unknown as { send: Record<string, (p?: unknown) => void> }).send;
						if (typeof send["tray:lock"] === "function") {
							send["tray:lock"]();
							sentViaRpc = true;
						}
					}
					if (sentViaRpc) return;
					// Fallback: direct JS dispatch for immediate effect and for tests
					const view: unknown = mainWindow?.webview;
					if (
						view &&
						typeof (view as { executeJavascript?: unknown }).executeJavascript ===
							"function"
					) {
						(view as { executeJavascript: (js: string) => void }).executeJavascript(
							"window.dispatchEvent(new CustomEvent('pr5auth:lock'))",
						);
					}
				} catch (e) {
					console.warn("Failed to send lock message", e);
				}
			};
			sendLock();
			// Retry only when window was recreated and webview is still loading
			if (didRecreate) setTimeout(sendLock, 600);
			return;
		}
		if (action === "quit") {
			isForceQuitting = true;
			Utils.quit();
			return;
		}
	};
	tray.on("tray-clicked", handleTrayEvent);
	// Electrobun docs historically used "tray-clicked" for both icon and menu,
	// but newer builds may emit "tray-item-clicked" for menu selections.
	// Listen to both to ensure Lock Vault / Quit fire on all versions.
	(tray as unknown as { on: (n: string, h: (e: unknown) => void) => void }).on(
		"tray-item-clicked",
		handleTrayEvent,
	);
} catch (e) {
	console.warn("Tray creation failed:", e);
}

 // Poll for minimize-to-tray: when minimized, hide to tray
if (tray) {
	setInterval(() => {
		if (!mainWindow || !minimizeToTray) return;
		try {
			if (mainWindow.isMinimized()) {
				hideWindow();
			}
		} catch {
			// ignore if window gone
		}
	}, 500);
}

// Close-to-tray & before-quit handling
try {
	const ee = (Electrobun as unknown as { events: { on: (n: string, h: (e: unknown) => void) => void } }).events;
	if (ee && typeof ee.on === "function") {
		ee.on("before-quit", (event: unknown) => {
			if (isForceQuitting) return;
			if (closeToTray && tray) {
				(event as { response: { allow: boolean } }).response = { allow: false };
			}
		});
		ee.on("close", (_event: unknown) => {
			// window already closed; before-quit keeps app alive
		});
	}
} catch {
	// ignore
}

console.log("PR5Auth started!");
