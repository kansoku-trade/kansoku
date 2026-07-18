import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

const SHA256_PATTERN = '^[a-f0-9]{64}$';
const DATASET_ID_PATTERN = '^[a-z0-9][a-z0-9-]*$';
const REPOSITORY_PATTERN = '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$';
const RELEASE_NAME_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]*$';
const ASSET_NAME_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]*\\.tar\\.zst$';

export const datasetManifestSchema = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    schemaVersion: Type.Literal(1),
    id: Type.String({ pattern: DATASET_ID_PATTERN }),
    revision: Type.String({ pattern: '^r[1-9][0-9]*$' }),
    kind: Type.Union([Type.Literal('single-shot'), Type.Literal('episode')]),
    status: Type.Optional(Type.Union([Type.Literal('pilot'), Type.Literal('production')])),
    modes: Type.Optional(
      Type.Array(Type.Union([Type.Literal('blind'), Type.Literal('live')]), {
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
      }),
    ),
    cohort: Type.Optional(Type.Union([Type.Literal('live-2026'), Type.Literal('blind-anonymous')])),
    visibility: Type.Literal('private'),
    repository: Type.String({ pattern: REPOSITORY_PATTERN }),
    release: Type.Object(
      {
        tag: Type.String({ pattern: RELEASE_NAME_PATTERN }),
        asset: Type.String({ pattern: ASSET_NAME_PATTERN }),
        sha256: Type.String({ pattern: SHA256_PATTERN }),
        sizeBytes: Type.Integer({ minimum: 1 }),
        archiveRoot: Type.String({ pattern: DATASET_ID_PATTERN }),
      },
      { additionalProperties: false },
    ),
    banks: Type.Record(Type.String({ pattern: DATASET_ID_PATTERN }), Type.Integer({ minimum: 1 }), {
      minProperties: 1,
    }),
    generator: Type.Object(
      {
        repository: Type.String({ pattern: REPOSITORY_PATTERN }),
        commit: Type.String({ pattern: '^[a-f0-9]{40}$' }),
      },
      { additionalProperties: false },
    ),
    publishedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export type DatasetManifest = Static<typeof datasetManifestSchema>;

export class DatasetManifestError extends Error {}

export const DEFAULT_MANIFESTS_ROOT = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  'dataset-manifests',
);

function assertDatasetId(id: string): void {
  if (!new RegExp(DATASET_ID_PATTERN).test(id)) {
    throw new DatasetManifestError(`invalid dataset id: ${id}`);
  }
}

export async function loadDatasetManifest(
  id: string,
  manifestsRoot: string = DEFAULT_MANIFESTS_ROOT,
): Promise<DatasetManifest> {
  assertDatasetId(id);
  const file = join(manifestsRoot, `${id}.json`);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    throw new DatasetManifestError(
      `dataset manifest not found for ${id}; available manifests live under ${manifestsRoot}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DatasetManifestError(`invalid JSON in dataset manifest: ${file}`);
  }
  if (!Value.Check(datasetManifestSchema, parsed)) {
    const first = Value.Errors(datasetManifestSchema, parsed)[0];
    throw new DatasetManifestError(
      `invalid dataset manifest ${file}: ${first?.instancePath || '(root)'} ${first?.message ?? 'schema mismatch'}`,
    );
  }
  if (parsed.id !== id || parsed.release.archiveRoot !== id) {
    throw new DatasetManifestError(
      `dataset manifest identity mismatch: requested ${id}, got ${parsed.id}/${parsed.release.archiveRoot}`,
    );
  }
  return parsed;
}
