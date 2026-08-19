import { BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import type { SecureStorageSchema } from "../shared/rpcSchema";
import { createSecureStorageBackend } from "./secureStorage";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const storageBackend = await createSecureStorageBackend();

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

const mainWindow = new BrowserWindow({
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

console.log("PR5Auth started!");
