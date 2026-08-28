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

export function buildCanvasTools(dir: string, now?: () => Date): AgentTool[] {
  const save: AgentTool<typeof saveSchema> = {
    name: 'save_canvas',
    label: 'Save Canvas',
    description:
      'Create or overwrite a named canvas file. slug is kebab-case. source is the full TSX. Same slug updates the same canvas.',
    parameters: saveSchema,
    execute: async (_id, params) => {
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
