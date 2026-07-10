import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

const CHART_DATA_REL = join("journal", "charts", "data");
const CHART_DB_NAME = "app.db";

export type SourceValidation =
  | { ok: true }
  | { ok: false; reason: "self" | "missing-journal" | "empty" };

export function validateImportSource(sourceRoot: string, destRoot: string): SourceValidation {
  if (realpathOrSelf(sourceRoot) === realpathOrSelf(destRoot)) {
    return { ok: false, reason: "self" };
  }
  const chartDataDir = join(sourceRoot, CHART_DATA_REL);
  if (!existsSync(chartDataDir)) {
    return { ok: false, reason: "missing-journal" };
  }
  const hasJson = readdirSync(chartDataDir).some((name) => name.endsWith(".json"));
  const hasDb = existsSync(join(chartDataDir, CHART_DB_NAME));
  if (!hasJson && !hasDb) {
    return { ok: false, reason: "empty" };
  }
  return { ok: true };
}

export interface ImportManifestEntry {
  relPath: string;
  sourcePath: string;
  destPath: string;
  exists: boolean;
}

export interface ImportManifest {
  entries: ImportManifestEntry[];
  collisionCount: number;
}

export function buildImportManifest(sourceRoot: string, destRoot: string): ImportManifest {
  const sourceChartDataDir = join(sourceRoot, CHART_DATA_REL);
  const destChartDataDir = join(destRoot, CHART_DATA_REL);

  const fileNames = existsSync(sourceChartDataDir)
    ? readdirSync(sourceChartDataDir).filter((name) => name.endsWith(".json") || name === CHART_DB_NAME)
    : [];

  const entries: ImportManifestEntry[] = fileNames.map((name) => {
    const relPath = join(CHART_DATA_REL, name);
    const destPath = join(destChartDataDir, name);
    return {
      relPath,
      sourcePath: join(sourceChartDataDir, name),
      destPath,
      exists: existsSync(destPath),
    };
  });

  return { entries, collisionCount: entries.filter((entry) => entry.exists).length };
}

export interface CopyImportOptions {
  overwrite: boolean;
}

export interface CopyImportResult {
  copied: number;
  skipped: number;
}

export function copyImportManifest(manifest: ImportManifest, opts: CopyImportOptions): CopyImportResult {
  let copied = 0;
  let skipped = 0;
  for (const entry of manifest.entries) {
    if (entry.exists && !opts.overwrite) {
      skipped++;
      continue;
    }
    mkdirSync(join(entry.destPath, ".."), { recursive: true });
    copyFileSync(entry.sourcePath, entry.destPath);
    copied++;
  }
  return { copied, skipped };
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
