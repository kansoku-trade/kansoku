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

describe('workspace mode', () => {
  let userDataPath = '';

  afterEach(() => {
    if (userDataPath) rmSync(userDataPath, { recursive: true, force: true });
  });

  function makeUserData(): string {
    userDataPath = mkdtempSync(join(tmpdir(), 'kansoku-workspace-mode-'));
    mkdirSync(dirname(workspaceModePath(userDataPath)), { recursive: true });
    return userDataPath;
  }

  it('defaults to local and round-trips an iCloud workspace chosen by Pro', () => {
    const root = makeUserData();
    expect(readWorkspaceModeSync(root)).toEqual({ mode: 'local' });

    const mode = {
      mode: 'icloud' as const,
      workspacePath: '/iCloud/Documents/Kansoku/Workspace',
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    writeWorkspaceModeSync(root, mode);
    expect(readWorkspaceModeSync(root)).toEqual(mode);
  });

  it('fails closed instead of silently opening an empty local workspace when the mode file is corrupt', () => {
    const root = makeUserData();
    writeFileSync(workspaceModePath(root), '{"mode":"icloud","workspacePath":"relative"}');
    expect(() => readWorkspaceModeSync(root)).toThrow(/配置损坏/);
  });
});
