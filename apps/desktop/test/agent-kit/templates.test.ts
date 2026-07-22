import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@kansoku/core/db/index';
import {
  acceptConflictWithTemplate,
  keepConflictOriginal,
  syncTemplate,
} from '@desktop/agent-kit/templates.js';
import { sha256, type AgentKitDataState } from '@desktop/agent-kit/state.js';
import type { ManifestTemplate } from '@desktop/agent-kit/manifest.js';

const template: ManifestTemplate = {
  path: 'templates/CLAUDE.md.tpl',
  dest: 'CLAUDE.md',
  sha256: 'hash-v1',
};

const render = () => 'TEMPLATE CONTENT V1';

describe('syncTemplate', () => {
  let dataRoot: string;
  let db: Db;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-kit-templates-'));
    db = createDb(':memory:');
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it('case 1: writes the target when it is absent', async () => {
    const outcome = syncTemplate({
      template,
      resourcesPath: '/unused',
      dataRoot,
      db,
      state: null,
      render,
    });
    expect(outcome).toEqual({ kind: 'written', dest: 'CLAUDE.md' });
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe('TEMPLATE CONTENT V1');
  });

  it('case 2: raises a conflict when target exists with no tracked state, and does not write', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'PRE-EXISTING USER FILE', 'utf8');
    const outcome = syncTemplate({
      template,
      resourcesPath: '/unused',
      dataRoot,
      db,
      state: null,
      render,
    });
    expect(outcome).toEqual({
      kind: 'conflict',
      conflict: { dest: 'CLAUDE.md', templatePath: template.path, reason: 'target-exists-no-state' },
    });
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe('PRE-EXISTING USER FILE');
  });

  it('case 3.1: skips silently when the user modified the file', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'USER EDITED', 'utf8');
    const state: AgentKitDataState = {
      kitVersion: '1.0.0',
      appVersion: '1.0.0',
      syncedAt: '2026-07-22T00:00:00.000Z',
      templates: {
        'CLAUDE.md': {
          initialContentHash: sha256('ORIGINAL'),
          sourceTemplateHash: template.sha256,
          writtenAt: '2026-07-22T00:00:00.000Z',
        },
      },
    };
    const outcome = syncTemplate({ template, resourcesPath: '/unused', dataRoot, db, state, render });
    expect(outcome).toEqual({ kind: 'skip-user-modified', dest: 'CLAUDE.md' });
  });

  it('case 3.2.1: skips silently when up to date', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'ORIGINAL', 'utf8');
    const state: AgentKitDataState = {
      kitVersion: '1.0.0',
      appVersion: '1.0.0',
      syncedAt: '2026-07-22T00:00:00.000Z',
      templates: {
        'CLAUDE.md': {
          initialContentHash: sha256('ORIGINAL'),
          sourceTemplateHash: 'hash-v1',
          writtenAt: '2026-07-22T00:00:00.000Z',
        },
      },
    };
    const outcome = syncTemplate({ template, resourcesPath: '/unused', dataRoot, db, state, render });
    expect(outcome).toEqual({ kind: 'skip-uptodate', dest: 'CLAUDE.md' });
  });

  it('case 3.2.2: records a pending update when the template changed upstream, without writing', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'ORIGINAL', 'utf8');
    const state: AgentKitDataState = {
      kitVersion: '1.0.0',
      appVersion: '1.0.0',
      syncedAt: '2026-07-22T00:00:00.000Z',
      templates: {
        'CLAUDE.md': {
          initialContentHash: sha256('ORIGINAL'),
          sourceTemplateHash: 'hash-v1',
          writtenAt: '2026-07-22T00:00:00.000Z',
        },
      },
    };
    const updatedTemplate: ManifestTemplate = { ...template, sha256: 'hash-v2' };
    const outcome = syncTemplate({
      template: updatedTemplate,
      resourcesPath: '/unused',
      dataRoot,
      db,
      state,
      render,
    });
    expect(outcome).toEqual({
      kind: 'pending-update',
      update: {
        dest: 'CLAUDE.md',
        templatePath: template.path,
        oldTemplateHash: 'hash-v1',
        newTemplateHash: 'hash-v2',
      },
    });
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe('ORIGINAL');
  });
});

describe('acceptConflictWithTemplate', () => {
  let dataRoot: string;
  let db: Db;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-kit-accept-'));
    db = createDb(':memory:');
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it('backs up the existing file and replaces the target with the template', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'OLD CONTENT', 'utf8');
    const result = acceptConflictWithTemplate({
      template,
      resourcesPath: '/unused',
      dataRoot,
      db,
      render: () => 'NEW CONTENT',
    });

    expect(await readFile(join(dataRoot, 'CLAUDE.md.bak'), 'utf8')).toBe('OLD CONTENT');
    expect(await readFile(join(dataRoot, 'CLAUDE.md'), 'utf8')).toBe('NEW CONTENT');
    expect(result).toEqual({
      initialContentHash: sha256('NEW CONTENT'),
      sourceTemplateHash: template.sha256,
      writtenAt: expect.any(String),
    });
  });
});

describe('keepConflictOriginal', () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'agent-kit-keep-'));
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it('records the current file hash as the initial hash and marks kept', async () => {
    await writeFile(join(dataRoot, 'CLAUDE.md'), 'USER CONTENT', 'utf8');
    const result = keepConflictOriginal({ template, dataRoot });
    expect(result).toEqual({
      initialContentHash: sha256('USER CONTENT'),
      sourceTemplateHash: template.sha256,
      writtenAt: expect.any(String),
      kept: true,
    });
  });
});
