import { BrowserView, BrowserWindow, Tray, Updater, Utils } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import type { SecureStorageSchema } from "../shared/rpcSchema";
import { StorageError } from "../shared/storageProvider";
import { createSecureStorageBackend, getDataDir } from "./secureStorage";
import { buildTrayMenu, formatTrayTitle } from "./tray";
import { SETTINGS_KEY, VAULT_KEY } from "../shared/storageProvider";
import * as updateService from "./updateService";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const storageBackend = await createSecureStorageBackend();

// Serialize storage writes with password-change migrations. Without this,
// a concurrent setItem can read the old key, migration re-encrypts the file
// with the new key, then the stale write overwrites it with old-key
// ciphertext before the manager installs the new key, leaving the file
// permanently undecryptable.
let vaultOpQueue: Promise<void> = Promise.resolve();
function withVaultSerial<T>(fn: () => Promise<T>): Promise<T> {
	const task = vaultOpQueue.then(fn, fn);
	vaultOpQueue = task.then(
		() => undefined,
		() => undefined,
	);
	return task;
}

// Helper to get VaultManager if present
function getVaultManager(): import("./vaultManager").VaultManager | null {
	const vb = storageBackend as unknown as { getVaultManager?: () => import("./vaultManager").VaultManager }
	if (vb && typeof vb.getVaultManager === "function") return vb.getVaultManager()
	// Also check VaultLockedStorageProvider shape
	return (storageBackend as unknown as { vaultManager?: import("./vaultManager").VaultManager }).vaultManager ?? null
}

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
	maxRequestTime: 30000,
	handlers: {
		requests: {
			"storage:getItem": async ({ key }) => storageBackend.getItem(key),
			"storage:setItem": async ({ key, value }) =>
				withVaultSerial(() => storageBackend.setItem(key, value)),
			"storage:removeItem": async ({ key }) => withVaultSerial(() => storageBackend.removeItem(key)),
			"storage:status": async () => storageBackend.getStatus(),
			"storage:reset": async () => withVaultSerial(() => storageBackend.reset()),
			"tray:updateCount": async ({ count }) => {
				accountCount = count;
				updateTrayTitle();
			},
			"tray:updateSettings": async ({ minimizeToTray: mtt, closeToTray: ctt }) => {
				minimizeToTray = mtt;
				closeToTray = ctt;
			},
			"vault:status": async () => {
				const vm = getVaultManager()
				if (!vm) throw new StorageError("Vault unavailable — key storage backends unavailable", "unavailable")
				return vm.getStatus()
			},
			"vault:createPassword": async ({ password }) =>
				withVaultSerial(async () => {
					const vm = getVaultManager()
					if (!vm) throw new Error("Vault manager unavailable")
					// Migrate existing fallback-encrypted data (e.g. SETTINGS_KEY) to the
					// new Argon2 key. Without this, VaultLockedStorageProvider.getKey()
					// would switch from the OS-keychain key to the Argon2 key while
					// .enc files remain encrypted with the old key and become
					// undecryptable (unrecoverable). Mirror changePassword's
					// migrateVaultData but with the fallback key as source.
					let fallbackKey: Uint8Array | undefined
					let fallbackUnavailable = false
					try {
						const backend = storageBackend as unknown as { fallback?: { getRawKey: () => Promise<Uint8Array> } }
						if (backend?.fallback?.getRawKey) {
							fallbackKey = await backend.fallback.getRawKey()
						} else {
							fallbackUnavailable = true
						}
					} catch {
						fallbackUnavailable = true
					}
					// If we have no source key but legacy `.enc` files exist, creating
					// a password would skip migrateVaultData and leave the old
					// ciphertext undecryptable with the new Argon2 key (unrecoverable).
					// Refuse until the OS key is available or the vault is reset.
					if (!fallbackKey && fallbackUnavailable) {
						try {
							const { readdir } = await import("node:fs/promises")
							const entries = await readdir(getDataDir())
							if (entries.some((e) => e.endsWith(".enc"))) {
								throw new StorageError(
									"Cannot create master password: encrypted vault data exists but the OS key backend is unavailable. Recover the original key or reset the vault before setting a password.",
									"unavailable",
								)
							}
						} catch (err) {
							if (err instanceof StorageError) throw err
							if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
						}
					}
					await vm.createMasterPassword(password, undefined, fallbackKey)
				}),
			"vault:unlock": async ({ password }) =>
				withVaultSerial(async () => {
					const vm = getVaultManager()
					if (!vm) throw new Error("Vault manager unavailable")
					await vm.unlock(password)
				}),
			"vault:lock": async () =>
				withVaultSerial(async () => {
					const vm = getVaultManager()
					if (!vm) return
					vm.lock()
				}),
			"vault:changePassword": async ({ oldPassword, newPassword }) =>
				withVaultSerial(async () => {
					const vm = getVaultManager()
					if (!vm) throw new Error("Vault manager unavailable")
					await vm.changePassword(oldPassword, newPassword)
				}),
			"vault:reset": async () =>
				withVaultSerial(async () => {
					// Delete encrypted data before metadata so a failure does not
					// orphan files without their password metadata.
					await storageBackend.reset()
					const vm = getVaultManager()
					if (vm) await vm.reset()
				}),
			"updater:check": async ({ force }) => updateService.checkForUpdate(Boolean(force)),
			"updater:download": async () => {
				// Avoid 5-minute global RPC timeout: keep 30s for vault/storage,
				// spawn long download in background and return quickly (<30s).
				const before = updateService.getState()
				if (before.updateReady) {
					return { ...before, updateAvailable: true, updateReady: true, checkedAt: before.checkedAt ?? Date.now() } as import("../shared/rpcSchema").UpdateCheckResult
				}
				void updateService.downloadUpdate().catch(() => {})
				// Optimistic downloading state for fast RPC response; real progress via updater:progress
				return {
					...before,
					status: "downloading" as const,
					progress: 0,
					error: null,
					checkedAt: Date.now(),
					updateAvailable: Boolean(before.newVersion),
					updateReady: false,
				} as import("../shared/rpcSchema").UpdateCheckResult
			},
			"updater:apply": async () => updateService.applyUpdate(),
			"updater:getState": async () => updateService.getState(),
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
			// Serialize with storage writes so an in-flight setItem that already
			// captured the key (as an immutable copy) either completes with the
			// old key before the lock or is queued after it. Without this, a
			// concurrent lock could also interleave with the RPC queue ordering.
			void withVaultSerial(async () => {
				try {
					getVaultManager()?.lock()
				} catch {
					// ignore
				}
			})
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

// Wire update progress → webview (Electrobun's built-in verification applies during download/apply)
try {
	updateService.setProgressSender((event) => {
		try {
			// Typed RPC send if available
			const send = (rpc as unknown as { send?: Record<string, (p: unknown) => void> }).send
			if (send && typeof send["updater:progress"] === "function") {
				;(send["updater:progress"] as (p: unknown) => void)(event)
				return
			}
		} catch {
			// ignore – progress reporting must never break main process
		}
		// Fallback: dispatch via JS if RPC unavailable (e.g. early window)
		try {
			const view: unknown = mainWindow?.webview
			if (view && typeof (view as { executeJavascript?: unknown }).executeJavascript === "function") {
				;(view as { executeJavascript: (js: string) => void }).executeJavascript(
					`window.dispatchEvent(new CustomEvent('pr5auth:updater-progress', {detail: ${JSON.stringify(event).replace(/</g, "\\u003c")}}))`,
				)
			}
		} catch {
			// ignore
		}
	})
} catch {
	// ignore
}

// Check for updates non-intrusively shortly after startup (at most once per launch; deductible via updateService)
try {
	updateService.scheduleStartupCheck(2500)
} catch {
	// Never allow update scheduling to prevent startup
}

console.log("PR5Auth started!");
