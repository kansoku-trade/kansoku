import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emit } from '../report.js';

interface Manifest {
  kitVersion: string;
  appVersion: string;
}

function defaultReadManifest(): Manifest {
  const manifestPath = join(import.meta.dirname ?? __dirname, 'manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
}

export function runInfo(argv: string[], readManifest: () => Manifest = defaultReadManifest): void {
  const sub = argv[0];
  switch (sub) {
    case 'kit-version': {
      return emit({ kitVersion: readManifest().kitVersion });
    }
    case 'data-root': {
      return emit({ dataRoot: process.env.TRADE_PROJECT_ROOT ?? null });
    }
    case 'version': {
      return emit({ version: readManifest().appVersion });
    }
    default: {
      process.stderr.write(`info: unknown sub-command "${sub}"\n`);
      process.exit(64);
    }
  }
}
