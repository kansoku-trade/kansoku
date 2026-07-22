import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ManifestTemplate = {
  path: string;
  dest: string;
  sha256: string;
  source?: 'app-config';
};

export type Manifest = {
  kitVersion: string;
  appVersion: string;
  templates: ManifestTemplate[];
};

export function readManifest(resourcesPath: string): Manifest {
  const p = join(resourcesPath, 'kansoku-agent-kit', 'manifest.json');
  return JSON.parse(readFileSync(p, 'utf8')) as Manifest;
}
