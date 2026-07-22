import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import { getDb } from '@kansoku/core/db/index';
import type { AgentKitLocation, AgentKitStatus } from '@kansoku/core/contract/agentKit';
import { dataRoot, dataRootStatus } from '../boot/env.js';
import { toEnvelope } from '../kernel/ipc/envelope.js';
import { ensureAgentKit } from './ensureAgentKit.js';
import { readManifest, type ManifestTemplate } from './manifest.js';
import { isFollowBlocked, resolveAgentKitDir } from './resolveLocation.js';
import {
  readState,
  removeConflict,
  removeUpdate,
  sha256,
  upsertTemplate,
  writeState,
  type AgentKitDataState,
} from './state.js';
import { defaultAgentKitStore, type AgentKitStore } from './store.js';
import { acceptConflictWithTemplate, keepConflictOriginal, makeRender } from './templates.js';

function resourcesPath(): string {
  return process.resourcesPath;
}

function templateFor(dest: string): ManifestTemplate {
  const template = readManifest(resourcesPath()).templates.find((t) => t.dest === dest);
  if (!template) throw new Error(`agentKit: unknown template dest ${dest}`);
  return template;
}

function resolveDir(store: AgentKitStore): string | null {
  return resolveAgentKitDir(store.read().location, dataRoot, dataRootStatus.mode);
}

function requireDir(store: AgentKitStore): string {
  const dir = resolveDir(store);
  if (dir === null) {
    throw new Error(
      'agentKit: no writable location — data root is the app default, please pick a custom folder',
    );
  }
  return dir;
}

function requireState(agentKitDir: string): AgentKitDataState {
  const state = readState(agentKitDir);
  if (!state) throw new Error('agentKit: no state to act against');
  return state;
}

function buildStatus(store: AgentKitStore): AgentKitStatus {
  const s = store.read();
  const dir = resolveAgentKitDir(s.location, dataRoot, dataRootStatus.mode);
  const state = dir ? readState(dir) : null;
  return {
    enabled: s.enabled,
    location: s.location,
    resolvedPath: dir,
    followBlocked: isFollowBlocked(s.location, dataRootStatus.mode),
    dataRoot,
    lastSyncAt: s.lastSyncAt,
    kitVersion: state?.kitVersion,
    pendingConflicts: state?.pendingConflicts,
    pendingUpdates: state?.pendingUpdates,
  };
}

async function runSync(store: AgentKitStore, agentKitDir: string) {
  const result = await ensureAgentKit({
    agentKitDir,
    dataRoot,
    resourcesPath: resourcesPath(),
    db: getDb(),
  });
  store.write({ ...store.read(), lastSyncAt: new Date().toISOString() });
  return result;
}

async function applyLocation(store: AgentKitStore, location: AgentKitLocation): Promise<AgentKitStatus> {
  store.write({ ...store.read(), location });
  const s = store.read();
  if (s.enabled) {
    const dir = resolveAgentKitDir(s.location, dataRoot, dataRootStatus.mode);
    if (dir) await runSync(store, dir);
  }
  return buildStatus(store);
}

export class AgentKitIpc extends IpcService {
  static readonly groupName = 'agentKit';

  @IpcMethod()
  getStatus() {
    return toEnvelope('agentKit.getStatus', () => buildStatus(defaultAgentKitStore(app)));
  }

  @IpcMethod()
  setEnabled(input: { enabled: boolean }) {
    return toEnvelope('agentKit.setEnabled', async () => {
      const store = defaultAgentKitStore(app);
      if (!input.enabled) {
        store.write({ ...store.read(), enabled: false });
        return { enabled: false };
      }
      const dir = resolveDir(store);
      if (dir === null) {
        store.write({ ...store.read(), enabled: true });
        return { enabled: true, conflicts: [], updates: [] };
      }
      const result = await runSync(store, dir);
      store.write({ ...store.read(), enabled: true });
      return { enabled: true, ...result };
    });
  }

  @IpcMethod()
  forceSync() {
    return toEnvelope('agentKit.forceSync', async () => {
      const store = defaultAgentKitStore(app);
      const dir = requireDir(store);
      return runSync(store, dir);
    });
  }

  @IpcMethod()
  resolveConflict(input: { dest: string; choice: 'use-template' | 'keep-original' }) {
    return toEnvelope('agentKit.resolveConflict', () => {
      const store = defaultAgentKitStore(app);
      const dir = requireDir(store);
      const template = templateFor(input.dest);
      const state = requireState(dir);
      const db = getDb();
      const templateState =
        input.choice === 'use-template'
          ? acceptConflictWithTemplate({
              template,
              resourcesPath: resourcesPath(),
              dataRoot: dir,
              db,
              render: makeRender(resourcesPath(), db),
            })
          : keepConflictOriginal({ template, dataRoot: dir });
      writeState(dir, removeConflict(upsertTemplate(state, input.dest, templateState), input.dest));
      return { dest: input.dest };
    });
  }

  @IpcMethod()
  applyUpdate(input: { dest: string }) {
    return toEnvelope('agentKit.applyUpdate', () => {
      const store = defaultAgentKitStore(app);
      const dir = requireDir(store);
      const template = templateFor(input.dest);
      const state = requireState(dir);
      const db = getDb();
      const oldTemplateHash = state.templates[input.dest]?.sourceTemplateHash;
      const templateState = acceptConflictWithTemplate({
        template,
        resourcesPath: resourcesPath(),
        dataRoot: dir,
        db,
        render: makeRender(resourcesPath(), db),
        backupSuffix: (oldTemplateHash ?? 'unknown').slice(0, 8),
      });
      writeState(dir, removeUpdate(upsertTemplate(state, input.dest, templateState), input.dest));
      return { dest: input.dest };
    });
  }

  @IpcMethod()
  clean() {
    return toEnvelope('agentKit.clean', () => {
      const store = defaultAgentKitStore(app);
      const dir = resolveDir(store);
      if (dir) {
        const state = readState(dir);
        if (state) {
          for (const [dest, templateState] of Object.entries(state.templates)) {
            if (templateState.kept) continue;
            const targetPath = join(dir, dest);
            if (!existsSync(targetPath)) continue;
            if (sha256(readFileSync(targetPath)) === templateState.initialContentHash) {
              rmSync(targetPath, { force: true });
            }
          }
        }
        rmSync(join(dir, '.kansoku-agent-kit'), { recursive: true, force: true });
      }
      store.write({ ...store.read(), enabled: false });
      return { cleaned: true };
    });
  }

  @IpcMethod()
  followDataRoot() {
    return toEnvelope('agentKit.followDataRoot', () =>
      applyLocation(defaultAgentKitStore(app), { kind: 'follow-data-root' }),
    );
  }

  @IpcMethod()
  pickCustomLocation() {
    return toEnvelope('agentKit.pickCustomLocation', async () => {
      const store = defaultAgentKitStore(app);
      const win = BrowserWindow.getFocusedWindow();
      const picked = await (win
        ? dialog.showOpenDialog(win, {
            title: '选择 Agent Kit 目录',
            properties: ['openDirectory', 'createDirectory'],
          })
        : dialog.showOpenDialog({
            title: '选择 Agent Kit 目录',
            properties: ['openDirectory', 'createDirectory'],
          }));
      if (picked.canceled || picked.filePaths.length === 0) return buildStatus(store);
      return applyLocation(store, { kind: 'custom', path: picked.filePaths[0] });
    });
  }
}
