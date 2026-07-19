import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const proDir = join(desktopDir, '..', 'pro');
const destDir = join(desktopDir, 'pro');

rmSync(destDir, { recursive: true, force: true });

if (!existsSync(join(proDir, 'package.json'))) {
  console.log('stagePro: apps/pro absent — packaging the free build');
  process.exit(0);
}

const release = spawnSync('pnpm', ['--filter', '@kansoku/pro', 'release'], {
  cwd: join(desktopDir, '..'),
  stdio: 'inherit',
});
if (release.status !== 0) process.exit(release.status ?? 1);

const encFile = join(proDir, 'dist-enc', 'pro.enc');
if (!existsSync(encFile)) {
  console.error(`stagePro: ${encFile} not found after pro release — packEnc did not run`);
  process.exit(1);
}

// Staged under desktop/ so electron-builder's `files` puts it INSIDE app.asar,
// matching where the decryption path (packages/core loader) expects to find it.
mkdirSync(destDir, { recursive: true });
cpSync(encFile, join(destDir, 'pro.enc'));
console.log('stagePro: staged pro.enc into the asar payload');
