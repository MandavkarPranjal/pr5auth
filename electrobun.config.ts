import type { ElectrobunConfig } from "electrobun";
import pkg from "./package.json";

export default {
  app: {
    name: "PR5Auth",
    identifier: "pr5auth.electrobun.dev",
    version: pkg.version,
  },
  release: {
    // Stable-only releases via GitHub /releases/latest/download (excludes prereleases).
    // Canary pipeline removed — previously `canary-<platform>-<arch>-update.json` was
    // unreachable via /latest because GitHub excludes prereleases from that redirect.
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
      icon: "assets/tray-icon.png",
    },
    win: {
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
