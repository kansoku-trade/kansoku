import { join } from 'node:path';
import { app } from 'electron';
import { ensureAgentKit } from '../agent-kit/ensureAgentKit.js';
import { resolveAgentKitDir } from '../agent-kit/resolveLocation.js';
import { defaultAgentKitStore } from '../agent-kit/store.js';
import {
  assertWorkspaceAvailable,
  initializeEmptyWorkspace,
  migrateLegacyStorage,
  type StorageMigrationResult,
} from '../storage/migration.js';
import { readWorkspaceModeSync } from '../storage/workspaceMode.js';
import { resolveDesktopStoragePaths, scaffoldDataRoot } from './paths.js';
import { bundledSkillsPath, ensureBundledSkills } from './skills.js';

// package.json's "name" is the scoped npm id ("@kansoku/desktop"), which
// Electron would otherwise use verbatim for app.getPath("userData").
app.setName('Kansoku');

const envOverride = process.env.TRADE_PROJECT_ROOT;
const isPackaged = app.isPackaged;
export const userDataPath = app.getPath('userData');
export const workspaceMode = isPackaged
  ? readWorkspaceModeSync(userDataPath)
  : { mode: 'local' as const };
export const storagePaths = resolveDesktopStoragePaths({
  isPackaged,
  envOverride,
  userDataPath,
  iCloudWorkspacePath: workspaceMode.mode === 'icloud' ? workspaceMode.workspacePath : null,
});

export const dataRoot = storagePaths.workspaceRoot;
export const stateRoot = storagePaths.stateRoot;
export const databasePath = storagePaths.databasePath;

if (isPackaged) {
  process.env.TRADE_MIGRATIONS_DIR = join(process.resourcesPath, 'drizzle');
  process.env.TRADE_SKILLS_DIR = bundledSkillsPath(process.resourcesPath);
  process.env.KANSOKU_DB_PATH = databasePath;
}
process.env.TRADE_PROJECT_ROOT = dataRoot;

export const IS_DEV = __DESKTOP_DEV__;

export async function prepareDesktopStorage(options?: {
  sourceRootOverride?: string;
  skipMigration?: boolean;
}): Promise<StorageMigrationResult | null> {
  if (!isPackaged) return null;

  if (workspaceMode.mode === 'icloud') await assertWorkspaceAvailable(dataRoot);

  let result: StorageMigrationResult | null = null;
  if (!envOverride && !options?.skipMigration) {
    result = await migrateLegacyStorage({
      userDataPath,
      workspaceRoot: dataRoot,
      databasePath,
      sourceRootOverride: options?.sourceRootOverride,
      beforeComplete: () => syncAgentKitAtBoot(true),
    });
  } else if (options?.skipMigration) {
    await initializeEmptyWorkspace({ workspaceRoot: dataRoot, databasePath });
  }

  scaffoldDataRoot(dataRoot);
  const skillsDir = bundledSkillsPath(process.resourcesPath);
  ensureBundledSkills(dataRoot, skillsDir);
  if (!result?.performed) await syncAgentKitAtBoot(false);
  return result;
}

async function syncAgentKitAtBoot(required: boolean): Promise<void> {
  if (process.platform !== 'darwin') return;
  const store = defaultAgentKitStore(app);
  if (!store.exists()) {
    store.write({ enabled: true, location: { kind: 'follow-data-root' } });
  }
  const state = store.read();
  if (!state.enabled) return;
  const agentKitDir = resolveAgentKitDir(state.location, dataRoot);

  try {
    const { getDb } = await import('@kansoku/core/db/index');
    await ensureAgentKit({
      agentKitDir,
      dataRoot,
      databasePath,
      resourcesPath: process.resourcesPath,
      db: getDb(),
    });
  } catch (error) {
    console.error('[agent-kit] boot sync failed', error);
    if (required) throw error;
  }
}
