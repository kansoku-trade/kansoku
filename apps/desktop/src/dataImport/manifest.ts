import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

const CHART_DATA_REL = join("journal", "charts", "data");

function isChartJson(name: string): boolean {
  return name.endsWith(".json") && name !== "index.json";
}

// app.db is deliberately never part of the import scope: the packaged
// kernel holds an open WAL-mode connection to dataRoot's app.db for the
// entire app lifetime (see packages/core/src/db/index.ts), and this menu item
// runs while that connection is live — copyFileSync-ing over it would risk
// corrupting the WAL. Only chart JSONs, which nothing holds open, are safe
// to import this way.
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
  const hasJson = readdirSync(chartDataDir).some(isChartJson);
  if (!hasJson) {
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
    ? readdirSync(sourceChartDataDir).filter(isChartJson)
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

export interface CopyImportFailure {
  relPath: string;
  error: string;
}

export interface CopyImportResult {
  copied: number;
  skipped: number;
  failed: number;
  failures: CopyImportFailure[];
}

// Each entry is copied independently and a failure (disk full, permission
// denied, etc.) never aborts the rest of the batch — the caller gets a full
// per-file account of what actually landed instead of a half-populated dest
// dir plus an unhandled rejection.
export function copyImportManifest(manifest: ImportManifest, opts: CopyImportOptions): CopyImportResult {
  let copied = 0;
  let skipped = 0;
  const failures: CopyImportFailure[] = [];
  for (const entry of manifest.entries) {
    if (entry.exists && !opts.overwrite) {
      skipped++;
      continue;
    }
    try {
      mkdirSync(join(entry.destPath, ".."), { recursive: true });
      copyFileSync(entry.sourcePath, entry.destPath);
      copied++;
    } catch (error) {
      failures.push({ relPath: entry.relPath, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { copied, skipped, failed: failures.length, failures };
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
