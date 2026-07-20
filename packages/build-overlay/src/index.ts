import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

const { dirname, extname, isAbsolute, relative, resolve, sep } = path;

export interface ProOverlayOptions {
  enabled?: boolean;
  overlayRoot?: string;
}

interface OverlayHostResolveResult {
  id: string;
  external?: boolean | 'absolute' | 'relative';
}

interface OverlayResolveContext {
  resolve?(
    source: string,
    importer: string | undefined,
    options: { skipSelf: boolean },
  ): OverlayHostResolveResult | null | Promise<OverlayHostResolveResult | null>;
}

export interface ProOverlayPlugin {
  name: string;
  enforce: 'pre';
  resolveId(
    this: OverlayResolveContext,
    source: string,
    importer?: string,
  ): string | null | Promise<string | null>;
}

const extensionCandidates: Readonly<Record<string, readonly string[]>> = {
  '': ['.pro.ts', '.pro.tsx', '.pro.mts', '.pro.cts'],
  '.cjs': ['.pro.cts'],
  '.cts': ['.pro.cts'],
  '.js': ['.pro.ts', '.pro.tsx'],
  '.jsx': ['.pro.tsx'],
  '.mjs': ['.pro.mts'],
  '.mts': ['.pro.mts'],
  '.ts': ['.pro.ts'],
  '.tsx': ['.pro.tsx'],
};

const externalUrlPattern = /^[a-zA-Z][a-zA-Z\d+.-]+:/;

function splitQuery(id: string): { path: string; query: string } {
  const queryIndex = id.search(/[#?]/);
  if (queryIndex === -1) return { path: id, query: '' };
  return { path: id.slice(0, queryIndex), query: id.slice(queryIndex) };
}

function isUnderNodeModules(filePath: string): boolean {
  return filePath.split(sep).includes('node_modules');
}

function candidatePaths(stem: string, extension: string): string[] {
  const suffixes = extensionCandidates[extension];
  if (!suffixes) return [];
  const paths = suffixes.map((suffix) => `${stem}${suffix}`);
  if (extension === '') {
    for (const suffix of suffixes) paths.push(`${stem}${sep}index${suffix}`);
  }
  return paths;
}

function assertWithinOverlayRoot(candidate: string, overlayRoot: string): void {
  const realCandidate = realpathSync(candidate);
  let realRoot: string;
  try {
    realRoot = realpathSync(overlayRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`pro overlayRoot "${overlayRoot}" does not exist`, { cause: error });
    }
    throw error;
  }
  const rel = relative(realRoot, realCandidate);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(
      `pro overlay projection "${candidate}" resolves outside overlayRoot "${overlayRoot}" (real target "${realCandidate}")`,
    );
  }
}

function assertNotSelfImport(candidate: string, importerPath: string | undefined): void {
  if (importerPath !== undefined && candidate === importerPath) {
    throw new Error(
      `pro overlay "${importerPath}" imports its own logical default; a .pro overlay must not import itself`,
    );
  }
}

function firstValidCandidate(
  candidates: readonly string[],
  overlayRoot: string | undefined,
  importerPath: string | undefined,
): string | null {
  for (const candidate of candidates) {
    if (!existsSync(candidate) || !lstatSync(candidate).isSymbolicLink()) continue;
    assertNotSelfImport(candidate, importerPath);
    if (overlayRoot) assertWithinOverlayRoot(candidate, overlayRoot);
    return candidate;
  }
  return null;
}

export function overlayCandidateForFile(
  filePath: string,
  options: ProOverlayOptions = {},
  importerPath?: string,
): string | null {
  const extension = extname(filePath);
  const suffixes = extensionCandidates[extension];
  if (!suffixes) return null;
  const stem = extension ? filePath.slice(0, -extension.length) : filePath;
  return firstValidCandidate(candidatePaths(stem, extension), options.overlayRoot, importerPath);
}

export function resolveProOverlayId(
  source: string,
  importer: string | undefined,
  options: ProOverlayOptions = {},
): string | null {
  if (options.enabled === false || !importer || !source.startsWith('.')) return null;
  if (source.includes('\0') || importer.includes('\0')) return null;

  const sourceParts = splitQuery(source);
  const importerPath = splitQuery(importer).path;
  if (!isAbsolute(importerPath) || sourceParts.path.includes('.pro.')) return null;

  const absoluteSource = resolve(dirname(importerPath), sourceParts.path);
  const candidate = overlayCandidateForFile(absoluteSource, options, importerPath);
  return candidate ? `${candidate}${sourceParts.query}` : null;
}

export { isProModule, proLeakGuard, type ProLeakGuardOptions } from './chunkGuard.js';

export function proOverlayPlugin(options: ProOverlayOptions = {}): ProOverlayPlugin {
  return {
    name: 'kansoku-pro-overlay',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source.startsWith('.')) return resolveProOverlayId(source, importer, options);
      if (options.enabled === false) return null;
      if (source.includes('\0') || externalUrlPattern.test(source)) return null;
      if (importer === undefined) return null;

      if (typeof this.resolve !== 'function') return null;

      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved || resolved.external || resolved.id.includes('\0')) return null;

      const resolvedParts = splitQuery(resolved.id);
      if (!isAbsolute(resolvedParts.path) || isUnderNodeModules(resolvedParts.path)) return null;

      const importerPath = splitQuery(importer).path;
      const candidate = overlayCandidateForFile(resolvedParts.path, options, importerPath);
      return candidate ? `${candidate}${resolvedParts.query}` : null;
    },
  };
}
