import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { type DatasetManifest, loadDatasetManifest } from './manifest.js';

const execFileAsync = promisify(execFile);
const INSTALL_MARKER = '.kansoku-dataset.json';

export interface DatasetInstallMarker {
  schemaVersion: 1;
  id: string;
  revision: string;
  sha256: string;
  installedAt: string;
  status?: DatasetManifest['status'];
  modes?: DatasetManifest['modes'];
  cohort?: DatasetManifest['cohort'];
}

export interface SyncDatasetOptions {
  id: string;
  datasetsRoot: string;
}

export interface SyncDatasetResult {
  manifest: DatasetManifest;
  target: string;
  status: 'installed' | 'present';
}

export interface SyncDatasetDependencies {
  loadManifest: (id: string) => Promise<DatasetManifest>;
  downloadRelease: (manifest: DatasetManifest, destination: string) => Promise<void>;
  extractArchive: (archive: string, destination: string) => Promise<void>;
  now: () => Date;
}

async function run(file: string, args: string[]): Promise<void> {
  await execFileAsync(file, args, { maxBuffer: 16 * 1024 * 1024 });
}

async function downloadRelease(manifest: DatasetManifest, destination: string): Promise<void> {
  try {
    await run('gh', [
      'release',
      'download',
      manifest.release.tag,
      '--repo',
      manifest.repository,
      '--pattern',
      manifest.release.asset,
      '--dir',
      dirname(destination),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to download dataset ${manifest.id} from ${manifest.repository}: ${message}. Authenticate gh for the private data repository first.`,
    );
  }
}

async function extractArchive(archive: string, destination: string): Promise<void> {
  await run('tar', ['-xf', archive, '-C', destination]);
}

const DEFAULT_DEPS: SyncDatasetDependencies = {
  loadManifest: loadDatasetManifest,
  downloadRelease,
  extractArchive,
  now: () => new Date(),
};

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function readMarker(target: string): Promise<DatasetInstallMarker | null> {
  try {
    return JSON.parse(
      await fs.readFile(join(target, INSTALL_MARKER), 'utf8'),
    ) as DatasetInstallMarker;
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  return fs.stat(path).then(
    () => true,
    () => false,
  );
}

async function validateExtractedDataset(root: string, manifest: DatasetManifest): Promise<void> {
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(
      `dataset archive ${manifest.release.asset} does not contain ${manifest.release.archiveRoot}/`,
    );
  }

  for (const [bank, expected] of Object.entries(manifest.banks)) {
    const bankDir = join(root, bank);
    const entries = await fs.readdir(bankDir, { withFileTypes: true }).catch(() => []);
    const actual = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).length;
    if (actual !== expected) {
      throw new Error(
        `dataset ${manifest.id} bank ${bank} expected ${expected} JSON cases, found ${actual}`,
      );
    }
  }
}

export async function syncDataset(
  options: SyncDatasetOptions,
  dependencies: Partial<SyncDatasetDependencies> = {},
): Promise<SyncDatasetResult> {
  const deps = { ...DEFAULT_DEPS, ...dependencies };
  const manifest = await deps.loadManifest(options.id);
  const target = join(options.datasetsRoot, manifest.id);
  const existing = await readMarker(target);
  if (
    existing?.id === manifest.id &&
    existing.revision === manifest.revision &&
    existing.sha256 === manifest.release.sha256
  ) {
    return { manifest, target, status: 'present' };
  }
  if (await pathExists(target)) {
    throw new Error(
      `dataset target already exists without the expected immutable marker: ${target}. Move it aside before syncing.`,
    );
  }

  await fs.mkdir(options.datasetsRoot, { recursive: true });
  const workDir = await fs.mkdtemp(join(options.datasetsRoot, `.sync-${manifest.id}-`));
  try {
    const downloadDir = join(workDir, 'download');
    const extractDir = join(workDir, 'extract');
    await fs.mkdir(downloadDir);
    await fs.mkdir(extractDir);
    const archive = join(downloadDir, manifest.release.asset);
    await deps.downloadRelease(manifest, archive);

    const stat = await fs.stat(archive).catch(() => null);
    if (!stat?.isFile() || stat.size !== manifest.release.sizeBytes) {
      throw new Error(
        `dataset asset size mismatch for ${manifest.id}: expected ${manifest.release.sizeBytes}, got ${stat?.size ?? 0}`,
      );
    }
    const sha256 = await sha256File(archive);
    if (sha256 !== manifest.release.sha256) {
      throw new Error(
        `dataset checksum mismatch for ${manifest.id}: expected ${manifest.release.sha256}, got ${sha256}`,
      );
    }

    await deps.extractArchive(archive, extractDir);
    const extractedRoot = join(extractDir, manifest.release.archiveRoot);
    await validateExtractedDataset(extractedRoot, manifest);
    const marker: DatasetInstallMarker = {
      schemaVersion: 1,
      id: manifest.id,
      revision: manifest.revision,
      sha256,
      installedAt: deps.now().toISOString(),
      ...(manifest.status ? { status: manifest.status } : {}),
      ...(manifest.modes ? { modes: manifest.modes } : {}),
      ...(manifest.cohort ? { cohort: manifest.cohort } : {}),
    };
    await fs.writeFile(
      join(extractedRoot, INSTALL_MARKER),
      `${JSON.stringify(marker, null, 2)}\n`,
      'utf8',
    );
    await fs.rename(extractedRoot, target);
    return { manifest, target, status: 'installed' };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
