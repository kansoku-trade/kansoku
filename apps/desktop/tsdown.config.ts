import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const isDev = process.env.KANSOKU_DESKTOP_DEV === "1";
const desktopAlias = {
  "@desktop": fileURLToPath(new URL("./src", import.meta.url)),
  "@server": fileURLToPath(new URL("../server/src", import.meta.url)),
};

export default defineConfig([
  {
    entry: "src/main.ts",
    outDir: "dist-main",
    format: "esm",
    platform: "node",
    alias: desktopAlias,
    define: {
      __DESKTOP_DEV__: JSON.stringify(isDev),
    },
    deps: {
      alwaysBundle: ["electron-window-state", /^@kansoku\//],
      neverBundle: [
        "electron",
        "better-sqlite3",
        "electron-context-menu",
        "electron-dl",
        "electron-is-dev",
        "cli-truncate",
        // tsx (dev-only, resolved at runtime from node_modules) must never be
        // bundled: its internals rely on CJS __filename, which breaks inside
        // an ESM bundle. The regex covers every subpath (tsx/esm/api), which a
        // bare "tsx" entry would miss. In packaged builds the __DESKTOP_DEV__
        // branch that imports it is stripped, so it is never referenced.
        /^tsx($|\/)/,
        // Keep Tsuki external so the bundled kernel and the tsx-loaded pro slot
        // share ONE instance. Its @Module/@Controller decorators key metadata
        // by module-local Symbol("…"); two bundled copies mint different
        // symbols, so pro's controllers would write metadata the kernel can't
        // read and no pro routes would map.
        /^@tsuki-hono\//,
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
    alias: desktopAlias,
    deps: { neverBundle: ["electron"] },
    dts: false,
    clean: true,
  },
]);
