import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// Resolved through packages/core (the root package.json does not depend on
// better-sqlite3); every workspace copy dedupes to the same .pnpm directory.
const coreRequire = createRequire(join(appRoot, "packages", "core", "package.json"));

const CACHE_DIR = join(appRoot, "node_modules", ".abi-cache");

function binaryPath() {
  let dir = dirname(coreRequire.resolve("better-sqlite3"));
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
  return { root: dir, binary: join(dir, "build", "Release", "better_sqlite3.node") };
}

function pkgVersion(root) {
  return coreRequire(join(root, "package.json")).version;
}

function cachePath(root, abiTag) {
  return join(CACHE_DIR, `better-sqlite3@${pkgVersion(root)}-${platform()}-${process.arch}-${abiTag}.node`);
}

// macOS caches code signatures by inode — a swapped-in binary with a stale
// ad-hoc signature gets SIGKILLed even when its content is valid.
function codesign(binary) {
  if (platform() !== "darwin") return;
  spawnSync("codesign", ["-s", "-", "-f", binary], { stdio: "pipe" });
}

function storeCache(binary, cacheFile) {
  mkdirSync(CACHE_DIR, { recursive: true });
  copyFileSync(binary, cacheFile);
}

function restoreCache(cacheFile, binary) {
  copyFileSync(cacheFile, binary);
  codesign(binary);
}

export function assertNoElectronDev(label) {
  const ps = spawnSync("ps", ["ax", "-o", "command"], { stdio: "pipe" });
  const running = String(ps.stdout)
    .split("\n")
    .some((line) => line.includes("Electron.app/Contents/MacOS/Electron") && line.includes(appRoot));
  if (running) {
    console.error(
      `[${label}] refusing to switch better-sqlite3 to the Node ABI: an Electron dev instance from this repo is running and would break on its next db access. Stop \`pnpm dev:desktop\` first.`,
    );
    process.exit(1);
  }
}

// probe runs in a child process: loading a wrong-ABI binary into this process
// doesn't always throw a catchable error — macOS can SIGKILL outright.
function probeNode() {
  // cwd must resolve better-sqlite3 — the app root's package.json does not
  // depend on it, so probe from packages/core instead.
  return spawnSync(process.execPath, ["-e", "new (require('better-sqlite3'))(':memory:').close()"], {
    cwd: join(appRoot, "packages", "core"),
    stdio: "pipe",
  });
}

function probeElectron(desktopRoot, electronBin) {
  return spawnSync(electronBin, ["-e", "new (require('better-sqlite3'))(':memory:').close()"], {
    cwd: desktopRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "pipe",
  });
}

function ensure({ label, abiTag, probe, slowRebuild }) {
  const { root, binary } = binaryPath();
  const cacheFile = cachePath(root, abiTag);

  if (probe().status === 0) {
    if (!existsSync(cacheFile)) storeCache(binary, cacheFile);
    console.log(`[${label}] better-sqlite3 OK (${abiTag})`);
    return;
  }

  if (existsSync(cacheFile)) {
    console.log(`[${label}] switching better-sqlite3 to ${abiTag} from local cache`);
    restoreCache(cacheFile, binary);
    if (probe().status === 0) return;
    console.log(`[${label}] cached binary rejected — falling back to a rebuild`);
    rmSync(cacheFile, { force: true });
  }

  console.log(`[${label}] rebuilding better-sqlite3 for ${abiTag}`);
  slowRebuild(root);
  const result = probe();
  if (result.status !== 0) {
    console.error(`[${label}] better-sqlite3 still unusable after rebuild (status=${result.status ?? result.signal})`);
    console.error(String(result.stderr));
    process.exit(1);
  }
  storeCache(binary, cacheFile);
}

export function ensureNodeAbi(label) {
  ensure({
    label,
    abiTag: `node-abi${process.versions.modules}`,
    probe: () => probeNode(),
    slowRebuild: (root) => {
      const requireFromRoot = createRequire(join(root, "package.json"));
      const bin = requireFromRoot.resolve("prebuild-install/bin.js");
      try {
        execFileSync(bin, [], { cwd: root, stdio: "inherit" });
      } catch {
        // prebuild-install reuses poisoned entries from ~/.npm/_prebuilds;
        // clear them and force a fresh download before giving up.
        rmSync(join(homedir(), ".npm", "_prebuilds"), { recursive: true, force: true });
        execFileSync(bin, ["--force"], { cwd: root, stdio: "inherit" });
      }
      codesign(binaryPath().binary);
    },
  });
}

export function ensureElectronAbi(desktopRoot, label) {
  const desktopRequire = createRequire(join(desktopRoot, "package.json"));
  const electronBin = desktopRequire("electron");
  const electronVersion = desktopRequire("electron/package.json").version;
  ensure({
    label,
    abiTag: `electron${electronVersion}`,
    probe: () => probeElectron(desktopRoot, electronBin),
    slowRebuild: () => {
      const result = spawnSync("pnpm", ["run", "rebuild-native"], { cwd: desktopRoot, stdio: "inherit" });
      if (result.status !== 0) process.exit(result.status ?? 1);
    },
  });
}
