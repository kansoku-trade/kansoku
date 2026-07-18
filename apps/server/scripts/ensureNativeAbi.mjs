import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

function packageRoot(entryFile) {
  let dir = dirname(entryFile);
  while (!require('node:fs').existsSync(join(dir, 'package.json'))) {
    dir = dirname(dir);
  }
  return dir;
}

// The probe runs in a child process: loading an Electron-ABI binary into Node
// doesn't always throw a catchable NODE_MODULE_VERSION error — macOS can
// SIGKILL the process outright, which would take this guard down with it.
function probe() {
  return spawnSync(
    process.execPath,
    ['-e', "new (require('better-sqlite3'))(':memory:').close()"],
    {
      cwd: dirname(fileURLToPath(import.meta.url)),
      stdio: 'pipe',
    },
  );
}

const first = probe();
if (first.status !== 0) {
  const entry = require.resolve('better-sqlite3');
  const root = packageRoot(entry);
  const requireFromRoot = createRequire(join(root, 'package.json'));
  console.log(
    `[ensureNativeAbi] better-sqlite3 unusable under Node (status=${first.status ?? first.signal}, likely left by an Electron rebuild) — reinstalling for Node at ${root}`,
  );
  execFileSync(requireFromRoot.resolve('prebuild-install/bin.js'), [], {
    cwd: root,
    stdio: 'inherit',
  });

  const second = probe();
  if (second.status !== 0) {
    console.error(
      `[ensureNativeAbi] better-sqlite3 still unusable after reinstall (status=${second.status ?? second.signal})`,
    );
    console.error(String(second.stderr));
    process.exit(1);
  }
}
