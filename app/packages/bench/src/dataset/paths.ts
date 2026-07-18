import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const DATA_DIR_ENV = "KANSOKU_BENCH_DATA_DIR";
export const SOURCE_CACHE_DIR_ENV = "KANSOKU_BENCH_SOURCE_CACHE_DIR";

export interface DatasetPaths {
  datasetsRoot: string;
  sourceCacheRoot: string;
}

export interface ParsedDatasetPathOptions extends DatasetPaths {
  argv: string[];
}

export function defaultDatasetsRoot(home: string = homedir()): string {
  return join(home, ".cache", "kansoku", "bench", "datasets");
}

export function defaultSourceCacheRoot(home: string = homedir()): string {
  return join(home, ".cache", "kansoku", "bench", "sources");
}

function containsPath(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a path`);
  return value;
}

export function parseDatasetPathOptions(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): ParsedDatasetPathOptions {
  let explicitDataDir: string | undefined;
  let explicitSourceCacheDir: string | undefined;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dataset-dir") {
      explicitDataDir = takeValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--source-cache-dir") {
      explicitSourceCacheDir = takeValue(argv, i, arg);
      i += 1;
      continue;
    }
    rest.push(arg);
  }

  const datasetsRoot = resolve(explicitDataDir ?? env[DATA_DIR_ENV] ?? defaultDatasetsRoot(home));
  const sourceCacheRoot = resolve(
    explicitSourceCacheDir ?? env[SOURCE_CACHE_DIR_ENV] ?? defaultSourceCacheRoot(home),
  );
  if (containsPath(datasetsRoot, sourceCacheRoot) || containsPath(sourceCacheRoot, datasetsRoot)) {
    throw new Error("dataset and source cache directories must be separate and non-nested");
  }

  return {
    argv: rest,
    datasetsRoot,
    sourceCacheRoot,
  };
}
