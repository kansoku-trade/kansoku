import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';

export type BenchReportUiEntry = 'episode' | 'leaderboard';

export interface BenchReportUiAssets {
  js: string;
  css: string;
}

const require = createRequire(import.meta.url);

function resolveDistFile(entry: BenchReportUiEntry, extension: 'js' | 'css'): string {
  const packageJsonPath = require.resolve('@kansoku/bench-report-ui/package.json');
  const packageRoot = path.dirname(packageJsonPath);
  return path.join(packageRoot, 'dist', `${entry}.${extension}`);
}

export function loadBenchReportUiAssets(entry: BenchReportUiEntry): BenchReportUiAssets {
  const jsPath = resolveDistFile(entry, 'js');
  const cssPath = resolveDistFile(entry, 'css');
  try {
    return {
      js: readFileSync(jsPath, 'utf8'),
      css: readFileSync(cssPath, 'utf8'),
    };
  } catch (error) {
    throw new Error(
      `@kansoku/bench-report-ui build output is missing (expected ${jsPath} and ${cssPath}). ` +
        `Run "pnpm --filter @kansoku/bench-report-ui build" first. Original error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      { cause: error },
    );
  }
}
