import type { AgentTool } from '@earendil-works/pi-agent-core';
import { promises as fs } from 'node:fs';
import { relative, sep } from 'node:path';
import { Type } from 'typebox';
import { textResult } from '../ai/agents/dataTools.js';
import { isSymlinkSafe, resolveRepoRelative, slashPath } from '../ai/agents/agentTools/fsMounts.js';
import { isLicensed } from '../license/licenseGate.js';
import { ClientError } from '../platform/errors.js';
import { assertCanvasQuota } from './quotaEnforce.js';
import { applyChunks, parsePatch, PatchError } from './applyPatch.js';
import { checkCanvasSource, reviewCanvasStructure } from './check.js';
import { type CanvasDoc, listCanvases, loadCanvas, saveCanvas } from './store.js';

const saveSchema = Type.Object({
  slug: Type.String(),
  title: Type.String(),
  source: Type.String(),
});

const readSchema = Type.Object({
  slug: Type.String(),
});

const listSchema = Type.Object({});

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
      'All hunks across all files apply together or not at all, and every updated source is validated before it is written.',
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

export function buildCanvasTools(dir: string, opts: CanvasToolsOptions = {}): AgentTool[] {
  const { now, skillLoaded, licensed = isLicensed } = opts;
  const save: AgentTool<typeof saveSchema> = {
    name: 'save_canvas',
    label: 'Save Canvas',
    description:
      'Create or overwrite a named canvas file. Read the canvas skill first (read_skill name="canvas") — it carries the required layout skeleton. slug is kebab-case. source is the full TSX. Same slug updates the same canvas. Free builds may keep at most 3 canvases; overwriting an existing slug is always allowed.',
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
      return textResult(JSON.stringify(doc));
    },
  };

  const list: AgentTool<typeof listSchema> = {
    name: 'list_canvases',
    label: 'List Canvases',
    description: 'List saved canvases as JSON [{ slug, title, mtime }].',
    parameters: listSchema,
    execute: async () => textResult(JSON.stringify(await listCanvases(dir))),
  };

  return [save, read, list];
}
