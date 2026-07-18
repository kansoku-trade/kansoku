import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureElectronAbi } from "../../../scripts/native-abi.mjs";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

ensureElectronAbi(desktopRoot, "ensureDevNative");

const bridgeRoot = join(desktopRoot, "node_modules", "electron-sparkle-updater", "native");
const bridgeReady =
  existsSync(join(bridgeRoot, "build", "Release", "sparkle_bridge.node")) &&
  existsSync(join(bridgeRoot, "vendor", "Sparkle.framework"));
if (!bridgeReady) {
  console.log("[ensureDevNative] electron-sparkle-updater native addon missing — building");
  const result = spawnSync("pnpm", ["run", "build:native"], { cwd: desktopRoot, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
} else {
  console.log(
    "[ensureDevNative] electron-sparkle-updater native addon present, skipping build (run `pnpm build:native` after changing its sources)",
  );
}
