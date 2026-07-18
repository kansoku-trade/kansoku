import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatasetManifestError, loadDatasetManifest } from '../../src/dataset/manifest.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('dataset manifests', () => {
  it('loads a bundled release contract that can drive installation', async () => {
    const manifest = await loadDatasetManifest('v1');

    expect(manifest.id).toBe('v1');
    expect(manifest.release.asset).toMatch(/\.tar\.zst$/);
    expect(manifest.release.sha256).toMatch(/^[\da-f]{64}$/);
    expect(manifest.banks.swing).toBeGreaterThan(0);
  });

  it('loads pilot mode and cohort restrictions', async () => {
    const live = await loadDatasetManifest('v2-live-pilot');
    const blind = await loadDatasetManifest('v2-blind-pilot');

    expect(live).toMatchObject({ status: 'pilot', modes: ['live'], cohort: 'live-2026' });
    expect(blind).toMatchObject({
      status: 'pilot',
      modes: ['blind'],
      cohort: 'blind-anonymous',
    });
  });

  it('rejects ids that could escape the manifest directory', async () => {
    await expect(loadDatasetManifest('../v1')).rejects.toThrow(DatasetManifestError);
  });

  it('rejects a malformed release contract before attempting a download', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bench-manifests-'));
    temporaryRoots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'broken.json'),
      JSON.stringify({ schemaVersion: 1, id: 'broken' }),
      'utf8',
    );

    await expect(loadDatasetManifest('broken', root)).rejects.toThrow(/invalid dataset manifest/);
  });
});
