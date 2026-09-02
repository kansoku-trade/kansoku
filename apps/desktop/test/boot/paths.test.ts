import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveDesktopStoragePaths,
  resolveRepoRoot,
  scaffoldDataRoot,
} from '@desktop/boot/paths.js';

describe('resolveRepoRoot', () => {
  it('lands on the repo root regardless of whether this module runs from src or a relocated build output', () => {
    const root = resolveRepoRoot();
    expect(existsSync(join(root, 'apps', 'desktop', 'package.json'))).toBe(true);
    expect(existsSync(join(root, 'pnpm-workspace.yaml'))).toBe(true);
  });
});

describe('resolveDesktopStoragePaths', () => {
  it('keeps packaged user files in a dedicated Workspace and the database in local State', () => {
    expect(
      resolveDesktopStoragePaths({
        isPackaged: true,
        envOverride: undefined,
        userDataPath: '/Users/x/Library/Application Support/Kansoku',
      }),
    ).toEqual({
      workspaceRoot: '/Users/x/Library/Application Support/Kansoku/Workspace',
      stateRoot: '/Users/x/Library/Application Support/Kansoku/State',
      databasePath: '/Users/x/Library/Application Support/Kansoku/State/app.db',
    });
  });

  it('keeps an explicit workspace override but never moves packaged local state into it', () => {
    expect(
      resolveDesktopStoragePaths({
        isPackaged: true,
        envOverride: '/tmp/agent-workspace',
        userDataPath: '/Users/x/Library/Application Support/Kansoku',
      }),
    ).toEqual({
      workspaceRoot: '/tmp/agent-workspace',
      stateRoot: '/Users/x/Library/Application Support/Kansoku/State',
      databasePath: '/Users/x/Library/Application Support/Kansoku/State/app.db',
    });
  });

  it('lets a resolved iCloud workspace replace only the packaged user-file root', () => {
    expect(
      resolveDesktopStoragePaths({
        isPackaged: true,
        envOverride: undefined,
        userDataPath: '/Users/x/Library/Application Support/Kansoku',
        iCloudWorkspacePath: '/iCloud/Documents/Workspace',
      }),
    ).toEqual({
      workspaceRoot: '/iCloud/Documents/Workspace',
      stateRoot: '/Users/x/Library/Application Support/Kansoku/State',
      databasePath: '/Users/x/Library/Application Support/Kansoku/State/app.db',
    });
  });

  it('preserves the repository layout for development', () => {
    const paths = resolveDesktopStoragePaths({
      isPackaged: false,
      envOverride: undefined,
      userDataPath: '/unused',
    });
    expect(paths.workspaceRoot).toBe(resolveRepoRoot());
    expect(paths.databasePath).toBe(join(resolveRepoRoot(), 'journal', 'charts', 'data', 'app.db'));
  });
});

describe('scaffoldDataRoot', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('creates the minimal dir shape the kernel expects on first run', () => {
    dir = mkdtempSync(join(tmpdir(), 'trade-data-root-'));
    scaffoldDataRoot(dir);
    expect(existsSync(join(dir, 'journal'))).toBe(true);
    expect(existsSync(join(dir, 'journal', 'charts', 'data'))).toBe(true);
    expect(existsSync(join(dir, 'journal', 'charts', 'annotations'))).toBe(true);
    expect(existsSync(join(dir, 'stocks'))).toBe(true);
  });
});
