import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const appBin = join(desktopDir, 'release', 'mac-arm64', 'Kansoku.app', 'Contents', 'MacOS', 'Kansoku');
const key = randomBytes(32).toString('hex');
let failures = 0;

// Electron keys `app.getPath('userData')` off the product name alone, so a
// packaged test binary launched with no override lands on the SAME profile
// dir (and SQLite file) as any already-running Kansoku.app install on this
// machine — two processes contending for that profile lock hangs boot
// indefinitely rather than failing fast. Each spawned instance gets its own
// throwaway --user-data-dir so this check never depends on nothing else
// touching Kansoku being open on the host.
function bootState(env) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'kansoku-four-state-'));
  const result = spawnSync(appBin, [`--user-data-dir=${userDataDir}`], {
    env: { ...process.env, ...env, KANSOKU_EXIT_AFTER_BOOT: '1' },
    encoding: 'utf8',
    timeout: 120_000,
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = /\[boot] proComposition=(active|free)/.exec(log);
  if (!match) {
    console.error('no [boot] proComposition line in output:\n' + log.slice(-2000));
    return { state: null, exitCode: result.status };
  }
  return { state: match[1], exitCode: result.status };
}

function expectState(label, env, expected) {
  const { state, exitCode } = bootState(env);
  if (state !== expected || exitCode !== 0) {
    console.error(`FAIL ${label}: state=${state} (want ${expected}), exit=${exitCode} (want 0)`);
    failures += 1;
    return;
  }
  console.log(`ok ${label}: proComposition=${state}, clean exit`);
}

function packageApp(env, label) {
  console.log(`\n== packaging: ${label}`);
  execFileSync('pnpm', ['package'], { cwd: desktopDir, stdio: 'inherit', env: { ...process.env, ...env } });
}

packageApp({ KANSOKU_BUNDLE_KEY: key, KANSOKU_BUNDLE_KEY_ID: 'four-state' }, 'pro build');
expectState('activated (correct key)', { KANSOKU_BUNDLE_KEY: key }, 'active');
expectState('locked (no key)', { KANSOKU_BUNDLE_KEY: '' }, 'free');
expectState('wrong key', { KANSOKU_BUNDLE_KEY: 'ff'.repeat(32) }, 'free');

packageApp({ KANSOKU_FORCE_FREE: '1' }, 'community build');
expectState('community build', {}, 'free');

process.exit(failures === 0 ? 0 : 1);
