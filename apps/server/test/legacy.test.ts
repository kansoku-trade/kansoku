import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let legacyDir: string;

vi.mock('@kansoku/core/platform/env', async () => {
  const actual = await vi.importActual<typeof import('@kansoku/core/platform/env')>('@kansoku/core/platform/env');
  return {
    ...actual,
    get LEGACY_CHARTS_DIR() {
      return legacyDir;
    },
  };
});

const { tsukiRequest } = await import('./helpers.js');

beforeEach(async () => {
  legacyDir = await mkdtemp(join(tmpdir(), 'legacy-test-'));
});

afterEach(async () => {
  await rm(legacyDir, { recursive: true, force: true });
});

describe('GET /api/legacy', () => {
  it('lists html files newest-first, skipping non-html entries', async () => {
    await writeFile(join(legacyDir, '2026-07-01-a.html'), '<html></html>');
    await writeFile(join(legacyDir, '2026-07-02-b.html'), '<html></html>');
    await writeFile(join(legacyDir, 'notes.txt'), 'ignore me');

    const res = await tsukiRequest('/api/legacy');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: [
        { file: '2026-07-02-b.html', url: '/legacy/2026-07-02-b.html', date: '2026-07-02' },
        { file: '2026-07-01-a.html', url: '/legacy/2026-07-01-a.html', date: '2026-07-01' },
      ],
    });
  });

  it('returns an empty list when the legacy dir does not exist', async () => {
    await rm(legacyDir, { recursive: true, force: true });
    const res = await tsukiRequest('/api/legacy');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: [] });
  });
});
