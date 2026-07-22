import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { lstatSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@kansoku/core/db/index';
import { watchedMarketsSettings } from '@kansoku/core/db/schema';
import { ensureAgentKit } from '@desktop/agent-kit/ensureAgentKit.js';
import { readState } from '@desktop/agent-kit/state.js';

async function buildResourcesFixture(resourcesPath: string): Promise<void> {
  const kitRoot = join(resourcesPath, 'kansoku-agent-kit');
  await mkdir(join(kitRoot, 'templates'), { recursive: true });
  await mkdir(join(kitRoot, 'bin'), { recursive: true });
  await writeFile(join(kitRoot, 'templates', 'CLAUDE.md.tpl'), 'CLAUDE TEMPLATE\n', 'utf8');
  await writeFile(join(kitRoot, 'templates', 'AGENTS.md.tpl'), 'AGENTS TEMPLATE\n', 'utf8');
  await writeFile(join(kitRoot, 'bin', 'kansoku-cli'), '#!/bin/sh\necho cli\n', 'utf8');
  await writeFile(
    join(kitRoot, 'manifest.json'),
    JSON.stringify(
      {
        kitVersion: '1.0.0+20260722',
        appVersion: '1.0.0',
        templates: [
          { path: 'templates/CLAUDE.md.tpl', dest: 'CLAUDE.md', sha256: 'sha-claude-v1' },
          { path: 'templates/AGENTS.md.tpl', dest: 'AGENTS.md', sha256: 'sha-agents-v1' },
          {
            path: '<runtime>',
            dest: 'journal/personal.md',
            sha256: 'app-config-v1',
            source: 'app-config',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );
}

describe('ensureAgentKit', () => {
  let dataRoot: string;
  let resourcesPath: string;
  let db: Db;
  const now = () => new Date('2026-07-22T00:00:00.000Z');

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-kit-data-root-'));
    resourcesPath = await mkdtemp(join(tmpdir(), 'agent-kit-resources-'));
    await buildResourcesFixture(resourcesPath);
    db = createDb(':memory:');
    db.insert(watchedMarketsSettings)
      .values({ id: 1, markets: ['US'], updatedAt: '2026-07-22T00:00:00.000Z' })
      .run();
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
    await rm(resourcesPath, { recursive: true, force: true });
  });

  it('provisions runtime.env, the CLI symlink, templates, and state on a clean data root', async () => {
    const result = await ensureAgentKit({ agentKitDir: dataRoot, dataRoot, resourcesPath, db, now });
    expect(result).toEqual({ conflicts: [], updates: [] });

    const kitDir = join(dataRoot, '.kansoku-agent-kit');
    const envContent = await readFile(join(kitDir, 'runtime.env'), 'utf8');
    expect(envContent).toBe(
      [
        `KANSOKU_CLI=${join(kitDir, 'bin', 'kansoku-cli')}`,
        `KANSOKU_DATA_ROOT=${dataRoot}`,
        `KANSOKU_AGENT_KIT_DIR=${dataRoot}`,
        'KANSOKU_APP_VERSION=1.0.0',
        'KANSOKU_KIT_VERSION=1.0.0+20260722',
        `TRADE_MIGRATIONS_DIR=${join(resourcesPath, 'drizzle')}`,
        '',
      ].join('\n'),
    );

    const shimPath = join(kitDir, 'bin', 'kansoku-cli');
    expect(lstatSync(shimPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(shimPath)).toBe(join(resourcesPath, 'kansoku-agent-kit', 'bin', 'kansoku-cli'));

    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe('CLAUDE TEMPLATE\n');
    expect(await readFile(join(dataRoot, 'AGENTS.md'), 'utf8')).toBe('AGENTS TEMPLATE\n');
    const personalMd = await readFile(join(dataRoot, 'journal', 'personal.md'), 'utf8');
    expect(personalMd).toContain('关注市场：US');

    const state = readState(dataRoot);
    expect(state?.kitVersion).toBe('1.0.0+20260722');
    expect(state?.appVersion).toBe('1.0.0');
    expect(state?.syncedAt).toBe('2026-07-22T00:00:00.000Z');
    expect(Object.keys(state?.templates ?? {}).sort()).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'journal/personal.md',
    ]);
    expect(state?.pendingConflicts).toBeUndefined();
    expect(state?.pendingUpdates).toBeUndefined();
  });

  it('replaces a stale CLI symlink on re-run instead of throwing', async () => {
    await ensureAgentKit({ agentKitDir: dataRoot, dataRoot, resourcesPath, db, now });

    const shimPath = join(dataRoot, '.kansoku-agent-kit', 'bin', 'kansoku-cli');
    await rm(shimPath, { force: true });
    await symlink('/nonexistent/stale-target', shimPath);

    await ensureAgentKit({ agentKitDir: dataRoot, dataRoot, resourcesPath, db, now });

    expect(readlinkSync(shimPath)).toBe(join(resourcesPath, 'kansoku-agent-kit', 'bin', 'kansoku-cli'));
  });

  it('leaves an unmodified template untouched and reports no pending items on a second pass', async () => {
    await ensureAgentKit({ agentKitDir: dataRoot, dataRoot, resourcesPath, db, now });
    const claudeMdBefore = await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8');

    const result = await ensureAgentKit({ agentKitDir: dataRoot, dataRoot, resourcesPath, db, now });
    expect(result).toEqual({ conflicts: [], updates: [] });
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe(claudeMdBefore);
  });

  it('does not re-write template state or duplicate entries on a second, up-to-date pass', async () => {
    const nowFirst = () => new Date('2026-07-22T00:00:00.000Z');
    const nowSecond = () => new Date('2026-07-23T00:00:00.000Z');

    await ensureAgentKit({ agentKitDir: dataRoot, dataRoot, resourcesPath, db, now: nowFirst });
    const writtenAtFirst = readState(dataRoot)?.templates['CLAUDE.md']?.writtenAt;

    const result = await ensureAgentKit({ agentKitDir: dataRoot, dataRoot, resourcesPath, db, now: nowSecond });
    expect(result).toEqual({ conflicts: [], updates: [] });

    const stateAfterSecond = readState(dataRoot);
    expect(stateAfterSecond?.templates['CLAUDE.md']?.writtenAt).toBe(writtenAtFirst);
    expect(stateAfterSecond?.syncedAt).toBe(nowSecond().toISOString());
    expect(Object.keys(stateAfterSecond?.templates ?? {}).sort()).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'journal/personal.md',
    ]);
  });

  it('writes templates and state under a custom agentKitDir, distinct from dataRoot', async () => {
    const agentKitDir = await mkdtemp(join(tmpdir(), 'agent-kit-custom-location-'));
    try {
      const result = await ensureAgentKit({ agentKitDir, dataRoot, resourcesPath, db, now });
      expect(result).toEqual({ conflicts: [], updates: [] });

      const kitDir = join(agentKitDir, '.kansoku-agent-kit');
      const envContent = await readFile(join(kitDir, 'runtime.env'), 'utf8');
      expect(envContent).toContain(`KANSOKU_DATA_ROOT=${dataRoot}`);
      expect(envContent).toContain(`KANSOKU_AGENT_KIT_DIR=${agentKitDir}`);

      expect(await readFile(join(agentKitDir, 'CLAUDE.md'), 'utf8')).toBe('CLAUDE TEMPLATE\n');
      await expect(readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).rejects.toThrow();

      expect(readState(agentKitDir)?.kitVersion).toBe('1.0.0+20260722');
      expect(readState(dataRoot)).toBeNull();
    } finally {
      await rm(agentKitDir, { recursive: true, force: true });
    }
  });
});
