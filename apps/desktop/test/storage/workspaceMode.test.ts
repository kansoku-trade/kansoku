import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readWorkspaceModeSync,
  workspaceModePath,
  writeWorkspaceModeSync,
} from '@desktop/storage/workspaceMode.js';
import { resolveDesktopStoragePaths } from '@desktop/boot/paths.js';

describe('workspace mode', () => {
  let userDataPath = '';
  const originalProjectRoot = process.env.TRADE_PROJECT_ROOT;

  afterEach(() => {
    if (userDataPath) rmSync(userDataPath, { recursive: true, force: true });
    if (originalProjectRoot === undefined) delete process.env.TRADE_PROJECT_ROOT;
    else process.env.TRADE_PROJECT_ROOT = originalProjectRoot;
  });

  function makeUserData(): string {
    userDataPath = mkdtempSync(join(tmpdir(), 'kansoku-workspace-mode-'));
    mkdirSync(dirname(workspaceModePath(userDataPath)), { recursive: true });
    return userDataPath;
  }

  it('defaults to local and round-trips an iCloud workspace chosen by Pro', () => {
    const root = makeUserData();
    expect(readWorkspaceModeSync(root)).toEqual({ mode: 'local' });
    process.env.TRADE_PROJECT_ROOT = join(root, 'Workspace');

    const mode = {
      mode: 'icloud' as const,
      workspacePath: '/iCloud/Documents/Kansoku/Workspace',
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    writeWorkspaceModeSync(root, mode);
    const restartedMode = readWorkspaceModeSync(root);

    expect(restartedMode).toEqual(mode);
    expect(
      resolveDesktopStoragePaths({
        isPackaged: true,
        envOverride: process.env.TRADE_PROJECT_ROOT,
        userDataPath: root,
        iCloudWorkspacePath: restartedMode.mode === 'icloud' ? restartedMode.workspacePath : null,
      }).workspaceRoot,
    ).toBe(mode.workspacePath);
  });

  it('updates the inherited runtime path when switching back to local', () => {
    const root = makeUserData();
    process.env.TRADE_PROJECT_ROOT = '/stale/iCloud/Workspace';

    writeWorkspaceModeSync(root, { mode: 'local' });

    expect(
      resolveDesktopStoragePaths({
        isPackaged: true,
        envOverride: process.env.TRADE_PROJECT_ROOT,
        userDataPath: root,
      }).workspaceRoot,
    ).toBe(join(root, 'Workspace'));
  });

  it('fails closed instead of silently opening an empty local workspace when the mode file is corrupt', () => {
    const root = makeUserData();
    writeFileSync(workspaceModePath(root), '{"mode":"icloud","workspacePath":"relative"}');
    expect(() => readWorkspaceModeSync(root)).toThrow(/配置损坏/);
  });
});
