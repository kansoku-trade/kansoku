import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const proNative = join(process.cwd(), 'pro', 'kansoku_icloud.node');
const args = ['--mac', 'dmg', 'zip', '--arm64'];
if (existsSync(proNative)) {
  args.push('--config.mac.entitlements=build/entitlements.mac.plist');
}

const result = spawnSync('electron-builder', args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
