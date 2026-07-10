import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function packageRoot(entryFile) {
  let dir = dirname(entryFile);
  while (!require("node:fs").existsSync(join(dir, "package.json"))) {
    dir = dirname(dir);
  }
  return dir;
}

try {
  const Database = require("better-sqlite3");
  new Database(":memory:").close();
} catch (err) {
  if (!String(err.message).includes("NODE_MODULE_VERSION")) throw err;

  const entry = require.resolve("better-sqlite3");
  const root = packageRoot(entry);
  const requireFromRoot = createRequire(join(root, "package.json"));
  console.log(`[ensureNativeAbi] better-sqlite3 ABI mismatch (likely left by an Electron rebuild) — reinstalling for Node at ${root}`);
  execFileSync(requireFromRoot.resolve("prebuild-install/bin.js"), [], { cwd: root, stdio: "inherit" });
}
