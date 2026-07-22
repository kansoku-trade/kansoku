import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { ensureAgentKit } from '../agent-kit/ensureAgentKit.js';
import { resolveAgentKitDir } from '../agent-kit/resolveLocation.js';
import { defaultAgentKitStore } from '../agent-kit/store.js';
import { buildDataRootStatus } from '../data/dataRoot/status.js';
import { isDataRootUsable } from '../data/dataRoot/usability.js';
import { resolveDataRoot, scaffoldDataRoot } from './paths.js';
import { bundledSkillsPath, ensureBundledSkills } from './skills.js';

// package.json's "name" is the scoped npm id ("@kansoku/desktop"), which
// Electron would otherwise use verbatim for app.getPath("userData") — the
// "/" turns into a nested folder. Pin it to productName before any path
// resolution runs.
app.setName('Kansoku');

const envOverride = process.env.TRADE_PROJECT_ROOT;
const isPackaged = app.isPackaged;
const userDataPath = app.getPath('userData');

const configuredPath = isPackaged ? readConfiguredPath(userDataPath) : null;
const customPathUsable = configuredPath !== null ? isDataRootUsable(configuredPath) : false;

export const dataRoot = resolveDataRoot({
  isPackaged,
  envOverride,
  userDataPath,
  customPath: configuredPath,
  customPathUsable,
});

export const dataRootStatus = buildDataRootStatus({
  isPackaged,
  envOverride,
  userDataPath,
  configuredPath,
  effectivePath: dataRoot,
  customPathUsable,
});

if (isPackaged) {
  scaffoldDataRoot(dataRoot);
  process.env.TRADE_MIGRATIONS_DIR = join(process.resourcesPath, 'drizzle');
  const skillsDir = bundledSkillsPath(process.resourcesPath);
  process.env.TRADE_SKILLS_DIR = skillsDir;
  ensureBundledSkills(dataRoot, skillsDir);
}
process.env.TRADE_PROJECT_ROOT = dataRoot;

export const IS_DEV = __DESKTOP_DEV__;

if (isPackaged && process.platform === 'darwin') {
  const store = defaultAgentKitStore(app);
  if (!store.exists()) {
    store.write({
      enabled: dataRootStatus.mode !== 'default',
      location: { kind: 'follow-data-root' },
    });
  }
  const state = store.read();
  if (state.enabled) {
    const agentKitDir = resolveAgentKitDir(state.location, dataRoot, dataRootStatus.mode);
    if (agentKitDir) {
      void (async () => {
        try {
          const { getDb } = await import('@kansoku/core/db/index');
          await ensureAgentKit({
            agentKitDir,
            dataRoot,
            resourcesPath: process.resourcesPath,
            db: getDb(),
          });
        } catch (err) {
          console.error('[agent-kit] boot sync failed', err);
        }
      })();
    }
  }
}

function readConfiguredPath(userDataPath: string): string | null {
  try {
    const raw = readFileSync(join(userDataPath, 'data-root.json'), 'utf8');
    const parsed = JSON.parse(raw) as { path?: unknown };
    return typeof parsed.path === 'string' ? parsed.path : null;
  } catch {
    return null;
  }
}
