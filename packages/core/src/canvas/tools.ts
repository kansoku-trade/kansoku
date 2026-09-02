import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { CandleFeed, IntradayBuilt } from '@kansoku/shared/types';
import { promises as fs } from 'node:fs';
import { relative, sep } from 'node:path';
import { Type } from 'typebox';
import { textResult } from '../ai/agents/dataTools.js';
import { isSymlinkSafe, resolveRepoRelative, slashPath } from '../ai/agents/agentTools/fsMounts.js';
import { buildChart } from '../charts/build.js';
import { isLicensed } from '../license/licenseGate.js';
import { ClientError } from '../platform/errors.js';
import { normalizeSymbol } from '../symbols/symbol.utils.js';
import { assertCanvasQuota } from './quotaEnforce.js';
import { applyChunks, parsePatch, PatchError } from './applyPatch.js';
import { checkCanvasSource, reviewCanvasStructure } from './check.js';
import { type CanvasDoc, loadCanvas, listCanvases, saveCanvas, saveCanvasData } from './store.js';

const saveSchema = Type.Object({
  slug: Type.String(),
  title: Type.String(),
  source: Type.String(),
});

const readSchema = Type.Object({
  slug: Type.String(),
});

const listSchema = Type.Object({});

const saveDataSchema = Type.Object({
  slug: Type.String(),
  name: Type.String(),
  json: Type.String(),
});

const snapshotCandlesSchema = Type.Object({
  slug: Type.String(),
  name: Type.String(),
  symbol: Type.String(),
});

const applyPatchSchema = Type.Object({
  patch: Type.String({ minLength: 1, maxLength: 200_000 }),
});

const CANVAS_FILE_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.canvas\.tsx$/;

export const CANVAS_SKILL_NAME = 'canvas';

export interface CanvasToolsOptions {
  now?: () => Date;
  /**
   * Returns whether the canvas skill has been read this turn. When supplied and false,
   * save_canvas refuses — a weak model that skipped the layout guide would otherwise ship
   * a canvas with no conclusion and hand-rolled tables, and prose alone does not stop it.
   */
  skillLoaded?: () => boolean;
  licensed?: () => boolean;
}

function canvasEditTarget(
  repoRoot: string,
  dir: string,
  rawPath: string,
): { path: string; slug: string; target: string } | null {
  if (rawPath.includes('\0')) return null;
  const target = resolveRepoRelative(repoRoot, rawPath);
  if (!target) return null;
  const file = relative(dir, target);
  if (!file || file === '..' || file.startsWith(`..${sep}`) || file.includes(sep)) return null;
  const slug = CANVAS_FILE_RE.exec(file)?.[1];
  if (!slug) return null;
  return { path: slashPath(relative(repoRoot, target)), slug, target };
}

export function buildCanvasApplyPatchTool(
  repoRoot: string,
  dir: string,
  opts: Pick<CanvasToolsOptions, 'now' | 'skillLoaded'> = {},
): AgentTool<typeof applyPatchSchema> {
  return {
    name: 'apply_patch',
    label: 'Apply Patch',
    description:
      'Apply one patch to existing journal/canvases/*.canvas.tsx files. Read the file and the canvas skill first. ' +
      'Format: "*** Begin Patch", then one or more "*** Update File: <path>" sections, each holding hunks; a hunk may open with "@@ <context line>" to pin its position, ' +
      'and its body lines start with " " (unchanged), "-" (remove), or "+" (add). End with "*** End Patch". Only Update File is accepted; creation goes through save_canvas. ' +
      'All hunks across all files apply together or not at all, and every updated source is validated before it is written. ' +
      "For K-line data use snapshot_candles, for any other data use save_canvas_data, then import x from './<name>.json' in the source.",
    parameters: applyPatchSchema,
    execute: async (_id, params) => {
      if (opts.skillLoaded && !opts.skillLoaded()) {
        return textResult(`edit failed: read_skill(name="${CANVAS_SKILL_NAME}") first`);
      }
      try {
        const files = parsePatch(params.patch);
        const staged: {
          path: string;
          slug: string;
          title: string;
          source: string;
          origin: CanvasDoc['origin'];
        }[] = [];
        for (const file of files) {
          const resolved = canvasEditTarget(repoRoot, dir, file.path);
          if (!resolved) {
            return textResult(
              `edit failed: path must be a journal/canvases/*.canvas.tsx file: ${file.path}`,
            );
          }
          const stat = await fs.lstat(resolved.target);
          if (!stat.isFile() || stat.isSymbolicLink()) {
            return textResult(`edit failed: not a regular canvas file: ${file.path}`);
          }
          if (!(await isSymlinkSafe({ name: 'canvases', root: dir }, resolved.target))) {
            return textResult(
              `edit failed: path resolves outside the canvas directory: ${file.path}`,
            );
          }
          const existing = await loadCanvas(dir, resolved.slug);
          if (!existing) return textResult(`edit failed: canvas not found: ${resolved.slug}`);
          let source: string;
          try {
            source = applyChunks(existing.source, file.chunks);
          } catch (error) {
            if (error instanceof PatchError) {
              return textResult(`edit failed: ${file.path}: ${error.message}`);
            }
            throw error;
          }
          const issues = [...checkCanvasSource(source), ...reviewCanvasStructure(source)];
          if (issues.length) return textResult(`edit failed: ${file.path}:\n${issues.join('\n')}`);
          staged.push({
            path: resolved.path,
            slug: resolved.slug,
            title: existing.title,
            source,
            origin: existing.origin,
          });
        }
        const lines: string[] = [];
        for (const entry of staged) {
          const result = await saveCanvas(dir, { ...entry, now: opts.now });
          if (!result.ok) return textResult(`edit failed:\n${result.issues.join('\n')}`);
          lines.push(`edited path=${entry.path} slug=${result.doc.slug} title=${result.doc.title}`);
        }
        return textResult(lines.join('\n'));
      } catch (error) {
        return textResult(`edit failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}

function shapeOf(value: unknown): string {
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (value && typeof value === 'object') return `object{${Object.keys(value).join(',')}}`;
  return typeof value;
}

export function buildCanvasTools(dir: string, opts: CanvasToolsOptions = {}): AgentTool[] {
  const { now, skillLoaded, licensed = isLicensed } = opts;
  const save: AgentTool<typeof saveSchema> = {
    name: 'save_canvas',
    label: 'Save Canvas',
    description:
      'Create or overwrite a named canvas file. Read the canvas skill first (read_skill name="canvas") — it carries the required layout skeleton. slug is kebab-case. source is the full TSX. Same slug updates the same canvas. Free builds may keep at most 3 canvases; overwriting an existing slug is always allowed. ' +
      "For K-line data use snapshot_candles, for any other data use save_canvas_data, then import x from './<name>.json' in the source.",
    parameters: saveSchema,
    execute: async (_id, params) => {
      if (skillLoaded && !skillLoaded()) {
        return textResult(
          `rejected: read_skill(name="${CANVAS_SKILL_NAME}") first, then rewrite the source to follow its layout skeleton.`,
        );
      }
      try {
        await assertCanvasQuota(dir, params.slug, licensed());
      } catch (error) {
        if (error instanceof ClientError && error.code === 'LICENSE_REQUIRED') {
          return textResult(`rejected: ${error.message}`);
        }
        throw error;
      }
      const result = await saveCanvas(dir, { ...params, now });
      if (!result.ok) {
        return textResult(`rejected:\n${result.issues.join('\n')}`);
      }
      return textResult(`saved slug=${result.doc.slug} title=${result.doc.title}`);
    },
  };

  const read: AgentTool<typeof readSchema> = {
    name: 'read_canvas',
    label: 'Read Canvas',
    description:
      'Read an existing canvas source and its last check record. Call this before editing.',
    parameters: readSchema,
    execute: async (_id, params) => {
      const doc = await loadCanvas(dir, params.slug);
      if (!doc) return textResult(`rejected: canvas not found: ${params.slug}`);
      const { data, ...rest } = doc;
      const dataFiles = Object.entries(data).map(([name, value]) => ({
        name,
        bytes: Buffer.byteLength(JSON.stringify(value), 'utf8'),
        shape: shapeOf(value),
      }));
      return textResult(JSON.stringify({ ...rest, dataFiles }));
    },
  };

  const list: AgentTool<typeof listSchema> = {
    name: 'list_canvases',
    label: 'List Canvases',
    description: 'List saved canvases as JSON [{ slug, title, mtime }].',
    parameters: listSchema,
    execute: async () => textResult(JSON.stringify(await listCanvases(dir))),
  };

  const saveData: AgentTool<typeof saveDataSchema> = {
    name: 'save_canvas_data',
    label: 'Save Canvas Data',
    description:
      "Write a JSON data file for an existing canvas, at journal/canvases/<slug>.<name>.json. name is [a-z0-9-]+, json must parse, at most 512 KB. The canvas source imports it with import x from './<name>.json'.",
    parameters: saveDataSchema,
    execute: async (_id, params) => {
      if (skillLoaded && !skillLoaded()) {
        return textResult(`rejected: read_skill(name="${CANVAS_SKILL_NAME}") first`);
      }
      const result = await saveCanvasData(dir, params);
      if (!result.ok) return textResult(`rejected:\n${result.issues.join('\n')}`);
      return textResult(
        `saved data slug=${params.slug} name=${params.name} bytes=${Buffer.byteLength(params.json, 'utf8')}`,
      );
    },
  };

  const snapshotCandles: AgentTool<typeof snapshotCandlesSchema> = {
    name: 'snapshot_candles',
    label: 'Snapshot Candles',
    description:
      "Fetch fresh m5/m15/h1 K-line for a symbol server-side and write it as a CandleFeed JSON data file for an existing canvas. The canvas source imports it with import x from './<name>.json'.",
    parameters: snapshotCandlesSchema,
    execute: async (_id, params) => {
      if (skillLoaded && !skillLoaded()) {
        return textResult(`rejected: read_skill(name="${CANVAS_SKILL_NAME}") first`);
      }
      const canvas = await loadCanvas(dir, params.slug);
      if (!canvas) return textResult(`rejected: canvas not found: ${params.slug}`);
      let symbol: string;
      try {
        symbol = normalizeSymbol(params.symbol);
      } catch (error) {
        return textResult(`rejected: ${error instanceof Error ? error.message : String(error)}`);
      }
      let built: IntradayBuilt;
      try {
        const result = await buildChart({
          type: 'intraday',
          symbol,
          session: 'all',
          skip_news: true,
          day_kline_lazy: true,
          enrichment_lazy: true,
        });
        built = result.built as IntradayBuilt;
      } catch (error) {
        return textResult(`rejected: ${error instanceof Error ? error.message : String(error)}`);
      }
      const feed: CandleFeed = {
        symbol,
        asOf: (now?.() ?? new Date()).toISOString(),
        timeframes: built.timeframes,
      };
      const result = await saveCanvasData(dir, {
        slug: params.slug,
        name: params.name,
        json: JSON.stringify(feed),
      });
      if (!result.ok) return textResult(`rejected:\n${result.issues.join('\n')}`);
      return textResult(
        `snapshot saved slug=${params.slug} name=${params.name} symbol=${symbol} bars m5=${feed.timeframes.m5.candles.length} m15=${feed.timeframes.m15.candles.length} h1=${feed.timeframes.h1.candles.length}`,
      );
    },
  };

  return [save, read, list, saveData, snapshotCandles];
}
