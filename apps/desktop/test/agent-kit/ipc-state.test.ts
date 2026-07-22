import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron-ipc-decorator', () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}));

const env = vi.hoisted(() => ({
  dataRoot: '',
  userDataPath: '',
  dataRootMode: 'custom' as 'custom' | 'default',
}));
const dialogMock = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));
vi.mock('electron', () => ({
  app: { getPath: () => env.userDataPath },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
  dialog: dialogMock,
}));
vi.mock('../../src/boot/env.js', () => ({
  get dataRoot() {
    return env.dataRoot;
  },
  get dataRootStatus() {
    return {
      mode: env.dataRootMode,
      effectivePath: env.dataRoot,
      configuredPath: null,
      degraded: false,
    };
  },
}));
vi.mock('@kansoku/core/db/index', () => ({ getDb: () => ({}) }));

const { AgentKitIpc } = await import('../../src/agent-kit/ipc.js');
const { readState } = await import('../../src/agent-kit/state.js');

const TEMPLATE_V1 = 'CLAUDE TEMPLATE V1\n';
const TEMPLATE_V2 = 'CLAUDE TEMPLATE V2\n';

function setResourcesPath(path: string): void {
  (process as unknown as { resourcesPath: string }).resourcesPath = path;
}

async function writeManifest(resourcesPath: string, sha256: string): Promise<void> {
  await writeFile(
    join(resourcesPath, 'kansoku-agent-kit', 'manifest.json'),
    JSON.stringify(
      {
        kitVersion: '1.0.0+20260722',
        appVersion: '1.0.0',
        templates: [{ path: 'templates/CLAUDE.md.tpl', dest: 'CLAUDE.md', sha256 }],
      },
      null,
      2,
    ),
    'utf8',
  );
}

describe('agent-kit ipc state mutations', () => {
  let dataRoot: string;
  let resourcesPath: string;
  let userDataPath: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-data-'));
    resourcesPath = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-resources-'));
    userDataPath = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-userdata-'));
    env.dataRoot = dataRoot;
    env.userDataPath = userDataPath;
    env.dataRootMode = 'custom';
    dialogMock.showOpenDialog.mockReset();
    setResourcesPath(resourcesPath);

    await mkdir(join(resourcesPath, 'kansoku-agent-kit', 'templates'), { recursive: true });
    await mkdir(join(resourcesPath, 'kansoku-agent-kit', 'bin'), { recursive: true });
    await writeFile(join(resourcesPath, 'kansoku-agent-kit', 'templates', 'CLAUDE.md.tpl'), TEMPLATE_V1, 'utf8');
    await writeFile(join(resourcesPath, 'kansoku-agent-kit', 'bin', 'kansoku-cli'), '#!/bin/sh\necho cli\n', 'utf8');
    await writeManifest(resourcesPath, 'sha-claude-v1');
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(resourcesPath, { recursive: true, force: true });
    await rm(userDataPath, { recursive: true, force: true });
  });

  it('setEnabled(true) syncs from a disabled store and persists enabled + lastSyncAt', async () => {
    await writeFile(
      join(userDataPath, 'agent-kit.json'),
      JSON.stringify({ enabled: false, location: { kind: 'follow-data-root' } }),
      'utf8',
    );

    const instance = new AgentKitIpc();
    const result = await instance.setEnabled({ enabled: true });
    expect(result).toMatchObject({ ok: true, data: { enabled: true, conflicts: [], updates: [] } });

    const storeRaw = JSON.parse(await readFile(join(userDataPath, 'agent-kit.json'), 'utf8'));
    expect(storeRaw.enabled).toBe(true);
    expect(typeof storeRaw.lastSyncAt).toBe('string');

    expect(existsSync(join(dataRoot, '.kansoku-agent-kit', 'runtime.env'))).toBe(true);
    const state = readState(dataRoot);
    expect(state?.templates['CLAUDE.md']).toBeDefined();
  });

  it('setEnabled(false) persists disabled without running a sync', async () => {
    await writeFile(
      join(userDataPath, 'agent-kit.json'),
      JSON.stringify({
        enabled: true,
        location: { kind: 'follow-data-root' },
        lastSyncAt: '2026-01-01T00:00:00.000Z',
      }),
      'utf8',
    );

    const instance = new AgentKitIpc();
    const result = await instance.setEnabled({ enabled: false });
    expect(result).toEqual({ ok: true, data: { enabled: false } });

    const storeRaw = JSON.parse(await readFile(join(userDataPath, 'agent-kit.json'), 'utf8'));
    expect(storeRaw).toEqual({
      enabled: false,
      location: { kind: 'follow-data-root' },
      lastSyncAt: '2026-01-01T00:00:00.000Z',
    });
    expect(existsSync(join(dataRoot, '.kansoku-agent-kit', 'state.json'))).toBe(false);
  });

  it('resolveConflict(use-template) backs up the target, writes the template, and clears the pending conflict', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'USER OWNED CONTENT\n', 'utf8');

    const instance = new AgentKitIpc();
    const syncResult = await instance.forceSync();
    expect(syncResult).toMatchObject({
      ok: true,
      data: { conflicts: [{ dest: 'CLAUDE.md', reason: 'target-exists-no-state' }] },
    });

    const resolveResult = await instance.resolveConflict({ dest: 'CLAUDE.md', choice: 'use-template' });
    expect(resolveResult).toEqual({ ok: true, data: { dest: 'CLAUDE.md' } });

    expect(await readFile(join(dataRoot, 'CLAUDE.md.bak'), 'utf8')).toBe('USER OWNED CONTENT\n');
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe(TEMPLATE_V1);

    const state = readState(dataRoot);
    expect(state?.templates['CLAUDE.md']?.sourceTemplateHash).toBe('sha-claude-v1');
    expect(state?.pendingConflicts).toBeUndefined();
  });

  it('resolveConflict(keep-original) leaves the target untouched and marks it kept', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'USER OWNED CONTENT\n', 'utf8');

    const instance = new AgentKitIpc();
    await instance.forceSync();

    const resolveResult = await instance.resolveConflict({ dest: 'CLAUDE.md', choice: 'keep-original' });
    expect(resolveResult).toEqual({ ok: true, data: { dest: 'CLAUDE.md' } });

    expect(existsSync(join(dataRoot, 'CLAUDE.md.bak'))).toBe(false);
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe('USER OWNED CONTENT\n');

    const state = readState(dataRoot);
    expect(state?.templates['CLAUDE.md']?.kept).toBe(true);
    expect(state?.pendingConflicts).toBeUndefined();
  });

  it('applyUpdate backs up the target under a hash-suffixed name, writes the new template, and clears the pending update', async () => {
    const instance = new AgentKitIpc();
    await instance.forceSync();
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe(TEMPLATE_V1);

    await writeFile(join(resourcesPath, 'kansoku-agent-kit', 'templates', 'CLAUDE.md.tpl'), TEMPLATE_V2, 'utf8');
    await writeManifest(resourcesPath, 'sha-claude-v2');

    const syncResult = await instance.forceSync();
    expect(syncResult).toMatchObject({
      ok: true,
      data: { updates: [{ dest: 'CLAUDE.md', oldTemplateHash: 'sha-claude-v1', newTemplateHash: 'sha-claude-v2' }] },
    });

    const applyResult = await instance.applyUpdate({ dest: 'CLAUDE.md' });
    expect(applyResult).toEqual({ ok: true, data: { dest: 'CLAUDE.md' } });

    const expectedSuffix = 'sha-claude-v1'.slice(0, 8);
    expect(await readFile(join(dataRoot, `CLAUDE.md.bak.${expectedSuffix}`), 'utf8')).toBe(TEMPLATE_V1);
    expect(existsSync(join(dataRoot, 'CLAUDE.md.bak'))).toBe(false);
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe(TEMPLATE_V2);

    const state = readState(dataRoot);
    expect(state?.templates['CLAUDE.md']?.sourceTemplateHash).toBe('sha-claude-v2');
    expect(state?.pendingUpdates).toBeUndefined();
  });

  it('applyUpdate after a resolved conflict backs up under a distinct suffix, not the conflict .bak', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'PRE-KIT USER FILE\n', 'utf8');

    const instance = new AgentKitIpc();
    await instance.forceSync();
    await instance.resolveConflict({ dest: 'CLAUDE.md', choice: 'use-template' });
    expect(await readFile(join(dataRoot, 'CLAUDE.md.bak'), 'utf8')).toBe('PRE-KIT USER FILE\n');
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe(TEMPLATE_V1);

    await writeFile(join(resourcesPath, 'kansoku-agent-kit', 'templates', 'CLAUDE.md.tpl'), TEMPLATE_V2, 'utf8');
    await writeManifest(resourcesPath, 'sha-claude-v2');
    await instance.forceSync();

    await instance.applyUpdate({ dest: 'CLAUDE.md' });

    const expectedSuffix = 'sha-claude-v1'.slice(0, 8);
    expect(await readFile(join(dataRoot, `CLAUDE.md.bak.${expectedSuffix}`), 'utf8')).toBe(TEMPLATE_V1);
    expect(await readFile(join(dataRoot, 'CLAUDE.md.bak'), 'utf8')).toBe('PRE-KIT USER FILE\n');
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe(TEMPLATE_V2);
  });
});

describe('agent-kit ipc location handling', () => {
  let dataRoot: string;
  let resourcesPath: string;
  let userDataPath: string;
  let customDir: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-data-'));
    resourcesPath = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-resources-'));
    userDataPath = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-userdata-'));
    customDir = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-custom-'));
    env.dataRoot = dataRoot;
    env.userDataPath = userDataPath;
    env.dataRootMode = 'custom';
    dialogMock.showOpenDialog.mockReset();
    setResourcesPath(resourcesPath);

    await mkdir(join(resourcesPath, 'kansoku-agent-kit', 'templates'), { recursive: true });
    await mkdir(join(resourcesPath, 'kansoku-agent-kit', 'bin'), { recursive: true });
    await writeFile(join(resourcesPath, 'kansoku-agent-kit', 'templates', 'CLAUDE.md.tpl'), TEMPLATE_V1, 'utf8');
    await writeFile(join(resourcesPath, 'kansoku-agent-kit', 'bin', 'kansoku-cli'), '#!/bin/sh\necho cli\n', 'utf8');
    await writeManifest(resourcesPath, 'sha-claude-v1');
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(resourcesPath, { recursive: true, force: true });
    await rm(userDataPath, { recursive: true, force: true });
    await rm(customDir, { recursive: true, force: true });
  });

  it('a custom location is used instead of dataRoot when set', async () => {
    await writeFile(
      join(userDataPath, 'agent-kit.json'),
      JSON.stringify({ enabled: true, location: { kind: 'custom', path: customDir } }),
      'utf8',
    );

    const instance = new AgentKitIpc();
    const result = await instance.forceSync();
    expect(result).toEqual({ ok: true, data: { conflicts: [], updates: [] } });

    expect(await readFile(join(customDir, 'CLAUDE.md'), 'utf8')).toBe(TEMPLATE_V1);
    expect(existsSync(join(dataRoot, 'CLAUDE.md'))).toBe(false);
    expect(readState(customDir)?.templates['CLAUDE.md']).toBeDefined();
    expect(readState(dataRoot)).toBeNull();
  });

  it('followDataRoot switches location back to follow-data-root and re-syncs', async () => {
    await writeFile(
      join(userDataPath, 'agent-kit.json'),
      JSON.stringify({ enabled: true, location: { kind: 'custom', path: customDir } }),
      'utf8',
    );

    const instance = new AgentKitIpc();
    const result = await instance.followDataRoot();
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        enabled: true,
        location: { kind: 'follow-data-root' },
        resolvedPath: dataRoot,
      }),
    });

    const storeRaw = JSON.parse(await readFile(join(userDataPath, 'agent-kit.json'), 'utf8'));
    expect(storeRaw.location).toEqual({ kind: 'follow-data-root' });
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe(TEMPLATE_V1);
  });

  it('pickCustomLocation stores the picked path and re-syncs there', async () => {
    await writeFile(
      join(userDataPath, 'agent-kit.json'),
      JSON.stringify({ enabled: true, location: { kind: 'follow-data-root' } }),
      'utf8',
    );
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [customDir] });

    const instance = new AgentKitIpc();
    const result = await instance.pickCustomLocation();
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        enabled: true,
        location: { kind: 'custom', path: customDir },
        resolvedPath: customDir,
      }),
    });

    const storeRaw = JSON.parse(await readFile(join(userDataPath, 'agent-kit.json'), 'utf8'));
    expect(storeRaw.location).toEqual({ kind: 'custom', path: customDir });
    expect(await readFile(join(customDir, 'CLAUDE.md'), 'utf8')).toBe(TEMPLATE_V1);
  });

  it('pickCustomLocation leaves the store untouched when the dialog is canceled', async () => {
    await writeFile(
      join(userDataPath, 'agent-kit.json'),
      JSON.stringify({ enabled: true, location: { kind: 'follow-data-root' } }),
      'utf8',
    );
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const instance = new AgentKitIpc();
    const result = await instance.pickCustomLocation();
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ location: { kind: 'follow-data-root' } }),
    });

    const storeRaw = JSON.parse(await readFile(join(userDataPath, 'agent-kit.json'), 'utf8'));
    expect(storeRaw.location).toEqual({ kind: 'follow-data-root' });
  });
});

describe('agent-kit ipc clean', () => {
  let dataRoot: string;
  let resourcesPath: string;
  let userDataPath: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-data-'));
    resourcesPath = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-resources-'));
    userDataPath = await mkdtemp(join(tmpdir(), 'agent-kit-ipc-userdata-'));
    env.dataRoot = dataRoot;
    env.userDataPath = userDataPath;
    env.dataRootMode = 'custom';
    dialogMock.showOpenDialog.mockReset();
    setResourcesPath(resourcesPath);

    await mkdir(join(resourcesPath, 'kansoku-agent-kit', 'templates'), { recursive: true });
    await mkdir(join(resourcesPath, 'kansoku-agent-kit', 'bin'), { recursive: true });
    await writeFile(join(resourcesPath, 'kansoku-agent-kit', 'templates', 'CLAUDE.md.tpl'), TEMPLATE_V1, 'utf8');
    await writeFile(join(resourcesPath, 'kansoku-agent-kit', 'bin', 'kansoku-cli'), '#!/bin/sh\necho cli\n', 'utf8');
    await writeManifest(resourcesPath, 'sha-claude-v1');
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(resourcesPath, { recursive: true, force: true });
    await rm(userDataPath, { recursive: true, force: true });
  });

  it('deletes a Kit-owned template file the user has not modified', async () => {
    const instance = new AgentKitIpc();
    await instance.forceSync();
    expect(existsSync(join(dataRoot, 'CLAUDE.md'))).toBe(true);

    const result = await instance.clean();
    expect(result).toEqual({ ok: true, data: { cleaned: true } });
    expect(existsSync(join(dataRoot, 'CLAUDE.md'))).toBe(false);
  });

  it('leaves a template file the user edited after Kit wrote it', async () => {
    const instance = new AgentKitIpc();
    await instance.forceSync();
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'USER EDITED AFTER SYNC\n', 'utf8');

    await instance.clean();

    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe('USER EDITED AFTER SYNC\n');
  });

  it('leaves a template the user explicitly kept via resolveConflict(keep-original)', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'USER OWNED CONTENT\n', 'utf8');
    const instance = new AgentKitIpc();
    await instance.forceSync();
    await instance.resolveConflict({ dest: 'CLAUDE.md', choice: 'keep-original' });

    await instance.clean();

    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe('USER OWNED CONTENT\n');
  });

  it('removes the .kansoku-agent-kit directory', async () => {
    const instance = new AgentKitIpc();
    await instance.forceSync();
    expect(existsSync(join(dataRoot, '.kansoku-agent-kit'))).toBe(true);

    await instance.clean();

    expect(existsSync(join(dataRoot, '.kansoku-agent-kit'))).toBe(false);
  });

  it('flips store.enabled to false', async () => {
    await writeFile(join(userDataPath, 'agent-kit.json'), JSON.stringify({ enabled: true }), 'utf8');
    const instance = new AgentKitIpc();
    await instance.forceSync();

    await instance.clean();

    const storeRaw = JSON.parse(await readFile(join(userDataPath, 'agent-kit.json'), 'utf8'));
    expect(storeRaw.enabled).toBe(false);
  });
});
