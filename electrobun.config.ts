import type { ElectrobunConfig } from "electrobun";
import pkg from "./package.json";

export default {
  app: {
    name: "PR5Auth",
    identifier: "pr5auth.electrobun.dev",
    version: pkg.version,
  },
  release: {
    baseUrl: "https://github.com/MandavkarPranjal/pr5auth/releases/latest/download",
  },
  build: {
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "assets/tray-icon.png": "views/mainview/tray-icon.png",
      "assets/app-icon.svg": "views/mainview/app-icon.svg",
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
