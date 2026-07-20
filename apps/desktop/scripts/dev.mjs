import { spawn } from 'node:child_process';
import { existsSync, statSync, watch } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(desktopRoot, 'package.json'));
const electronBin = require('electron');

const MAIN_BUNDLE = join(desktopRoot, 'dist-main', 'main.mjs');
const PRELOAD_BUNDLE = join(desktopRoot, 'dist-preload', 'preload.cjs');

let electron = null;
let restarting = false;
let shuttingDown = false;

// vite.main.config.ts imports @kansoku/build-overlay, whose NodeNext `.js`
// specifiers over `.ts` sources the default config loader cannot resolve for
// an externalized workspace package — needs --configLoader runner, same as
// the `build` script. vite.preload.config.ts has no such import, so it keeps
// the default loader (the runner loader is experimental; no reason to widen
// its blast radius).
const configLoaderArgs = {
  'vite.main.config.ts': ['--configLoader', 'runner'],
  'vite.preload.config.ts': [],
};
const watchers = ['vite.main.config.ts', 'vite.preload.config.ts'].map((config) => {
  const child = spawn(
    'pnpm',
    ['exec', 'vite', 'build', '--watch', '-c', config, ...configLoaderArgs[config]],
    {
      cwd: desktopRoot,
      stdio: 'inherit',
      env: { ...process.env, KANSOKU_DESKTOP_DEV: '1' },
    },
  );
  child.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 1);
  });
  return child;
});

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  electron?.kill();
  for (const child of watchers) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function startElectron() {
  electron = spawn(electronBin, ['.'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_DEV: '1' },
  });
  electron.on('exit', (code) => {
    if (shuttingDown) return;
    if (restarting) {
      restarting = false;
      startElectron();
      return;
    }
    // The app was quit by hand — stop the watcher instead of idling forever.
    console.log('[desktop-dev] electron exited, stopping dev watcher');
    shutdown(code ?? 0);
  });
}

let debounce = null;
function scheduleRestart() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (shuttingDown || !electron) return;
    console.log('[desktop-dev] bundle changed, restarting electron');
    restarting = true;
    electron.kill();
  }, 400);
}

function watchBundles() {
  // Pro sources are part of the main graph now, so a rebuild of dist-main
  // covers pro edits too — no separate source watch needed.
  for (const dir of [dirname(MAIN_BUNDLE), dirname(PRELOAD_BUNDLE)]) {
    watch(dir, { recursive: true }, scheduleRestart);
  }
}

// emptyOutDir wipes both dist dirs on startup and the two builds finish at
// different times, so wait until both bundles exist and have been quiet for a
// second before launching electron or attaching watchers.
const started = Date.now();
let lastChange = Date.now();
let lastSignature = '';
const poll = setInterval(() => {
  if (Date.now() - started > 60_000) {
    console.error('[desktop-dev] initial build did not produce bundles within 60s');
    shutdown(1);
    return;
  }
  if (!existsSync(MAIN_BUNDLE) || !existsSync(PRELOAD_BUNDLE)) return;
  const signature = [MAIN_BUNDLE, PRELOAD_BUNDLE].map((f) => statSync(f).mtimeMs).join(':');
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
