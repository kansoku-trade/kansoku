import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: "src/main.ts",
    outDir: "dist-main",
    format: "esm",
    platform: "node",
    deps: {
      alwaysBundle: ["electron-window-state"],
      neverBundle: [
        "electron",
        "better-sqlite3",
        "electron-context-menu",
        "electron-dl",
        "electron-is-dev",
        "cli-truncate",
      ],
    },
    dts: false,
    clean: true,
  },
  {
    entry: "src/preload.ts",
    outDir: "dist-preload",
    format: "cjs",
    platform: "node",
    deps: { neverBundle: ["electron"] },
    dts: false,
    clean: true,
  },
]);
