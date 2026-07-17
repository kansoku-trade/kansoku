import { spawn } from "node:child_process";
import { existsSync, statSync, watch } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(desktopRoot, "package.json"));
const electronBin = require("electron");

const MAIN_BUNDLE = join(desktopRoot, "dist-main", "main.mjs");
const PRELOAD_BUNDLE = join(desktopRoot, "dist-preload", "preload.cjs");

let electron = null;
let restarting = false;
let shuttingDown = false;

const tsdown = spawn("pnpm", ["exec", "tsdown", "--watch"], {
  cwd: desktopRoot,
  stdio: "inherit",
  env: { ...process.env, KANSOKU_DESKTOP_DEV: "1" },
});
tsdown.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  electron?.kill();
  tsdown.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function startElectron() {
  electron = spawn(electronBin, ["."], {
    cwd: desktopRoot,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_DEV: "1" },
  });
  electron.on("exit", (code) => {
    if (shuttingDown) return;
    if (restarting) {
      restarting = false;
      startElectron();
      return;
    }
    // The app was quit by hand — stop the watcher instead of idling forever.
    console.log("[desktop-dev] electron exited, stopping dev watcher");
    shutdown(code ?? 0);
  });
}

let debounce = null;
function scheduleRestart() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (shuttingDown || !electron) return;
    console.log("[desktop-dev] bundle changed, restarting electron");
    restarting = true;
    electron.kill();
  }, 400);
}

function watchBundles() {
  for (const dir of [dirname(MAIN_BUNDLE), dirname(PRELOAD_BUNDLE)]) {
    watch(dir, scheduleRestart);
  }
  // The pro slot loads as TS at runtime (never bundled into main.mjs), so a
  // bundle-dir watch can't see edits to it — watch the source tree directly.
  const proSrc = join(desktopRoot, "..", "pro", "src");
  if (existsSync(proSrc)) watch(proSrc, { recursive: true }, scheduleRestart);
}

// tsdown `clean: true` wipes both dist dirs on startup and the two configs
// finish at different times, so wait until both bundles exist and have been
// quiet for a second before launching electron or attaching watchers.
const started = Date.now();
let lastChange = Date.now();
let lastSignature = "";
const poll = setInterval(() => {
  if (Date.now() - started > 60_000) {
    console.error("[desktop-dev] initial build did not produce bundles within 60s");
    shutdown(1);
    return;
  }
  if (!existsSync(MAIN_BUNDLE) || !existsSync(PRELOAD_BUNDLE)) return;
  const signature = [MAIN_BUNDLE, PRELOAD_BUNDLE].map((f) => statSync(f).mtimeMs).join(":");
  if (signature !== lastSignature) {
    lastSignature = signature;
    lastChange = Date.now();
    return;
  }
  if (Date.now() - lastChange < 1_000) return;
  clearInterval(poll);
  watchBundles();
  startElectron();
}, 200);
