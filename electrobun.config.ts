import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "PR5Auth",
		identifier: "pr5auth.electrobun.dev",
		version: "1.0.0",
	},
	build: {
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"assets/app-icon.png": "views/mainview/app-icon.png",
			"assets/tray-icon.png": "views/mainview/tray-icon.png",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
