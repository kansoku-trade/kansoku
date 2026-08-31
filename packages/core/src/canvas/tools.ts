import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { textResult } from '../ai/agents/dataTools.js';
import { listCanvases, loadCanvas, saveCanvas } from './store.js';

const saveSchema = Type.Object({
  slug: Type.String(),
  title: Type.String(),
  source: Type.String(),
});

const readSchema = Type.Object({
  slug: Type.String(),
});

const listSchema = Type.Object({});

export const CANVAS_SKILL_NAME = 'canvas';

export interface CanvasToolsOptions {
  now?: () => Date;
  /**
   * Returns whether the canvas skill has been read this turn. When supplied and false,
   * save_canvas refuses — a weak model that skipped the layout guide would otherwise ship
   * a canvas with no conclusion and hand-rolled tables, and prose alone does not stop it.
   */
  skillLoaded?: () => boolean;
}

export function buildCanvasTools(dir: string, opts: CanvasToolsOptions = {}): AgentTool[] {
  const { now, skillLoaded } = opts;
  const save: AgentTool<typeof saveSchema> = {
    name: 'save_canvas',
    label: 'Save Canvas',
    description:
      'Create or overwrite a named canvas file. Read the canvas skill first (read_skill name="canvas") — it carries the required layout skeleton. slug is kebab-case. source is the full TSX. Same slug updates the same canvas.',
    parameters: saveSchema,
    execute: async (_id, params) => {
      if (skillLoaded && !skillLoaded()) {
        return textResult(
          `rejected: read_skill(name="${CANVAS_SKILL_NAME}") first, then rewrite the source to follow its layout skeleton.`,
        );
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
    description: 'Read an existing canvas source and its last check record. Call this before editing.',
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
