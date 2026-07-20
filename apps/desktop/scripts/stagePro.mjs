import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const proDir = join(desktopDir, '..', 'pro');
const destDir = join(desktopDir, 'pro');
const destFile = join(destDir, 'pro.enc');

rmSync(destDir, { recursive: true, force: true });

const nodeStage = join(desktopDir, 'dist-main', '__pro__');
const webDistRoot = join(desktopDir, '..', 'web', 'dist');
const webStage = join(webDistRoot, 'assets', '__pro__');

if (process.env.KANSOKU_FORCE_FREE === '1' || !existsSync(join(proDir, 'package.json'))) {
  if (existsSync(nodeStage) || existsSync(webStage)) {
    console.error('stagePro: a __pro__ dir exists on a free build — stale build, rerun pnpm build');
    process.exit(1);
  }
  console.log('stagePro: packaging the free build');
  process.exit(0);
}

for (const [label, dir] of [
  ['dist-main', nodeStage],
  ['web dist', webStage],
]) {
  if (!existsSync(dir)) {
    console.error(`stagePro: apps/pro present but ${label} __pro__ missing — run pnpm build first`);
    process.exit(1);
  }
}

// Staged under desktop/ so electron-builder's `files` puts pro.enc INSIDE
// app.asar, matching where the decryption path (packages/core loader) expects
// to find it.
mkdirSync(destDir, { recursive: true });
const args = [
  join(proDir, 'scripts', 'packEnc.mjs'),
  '--node',
  nodeStage,
  '--web',
  webStage,
  '--web-root',
  webDistRoot,
  '--out',
  destFile,
];
if (!process.env.KANSOKU_BUNDLE_KEY && process.env.KANSOKU_BUNDLE_DEV_RANDOM_KEY === '1') {
  args.push('--dev-random-key');
}
const packEnc = spawnSync('node', args, { stdio: 'inherit' });
if (packEnc.status !== 0) process.exit(packEnc.status ?? 1);

// The plaintext pro chunks must never reach electron-builder — pro.enc is the
// only artifact that ships. afterPack's canary scan backstops this deletion.
rmSync(nodeStage, { recursive: true, force: true });
rmSync(webStage, { recursive: true, force: true });
console.log('stagePro: staged pro.enc and removed both plaintext __pro__ dirs');
