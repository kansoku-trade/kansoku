import type { AgentTool } from '@earendil-works/pi-agent-core';
import { buildCanvasTools } from '../canvas/tools.js';
import { createAgentSession } from '../ai/agents/agentSession.js';
import { aiConfig } from '../ai/runtime/models.js';
import type { EventEvidencePack } from './evidencePack.js';

function bindCanvasSlug(tools: AgentTool[], slug: string): AgentTool[] {
  return tools.map((tool) => {
    if (tool.name !== 'save_canvas') return tool;
    return {
      ...tool,
      execute: async (id, params) =>
        tool.execute(id, { ...(params as { slug?: string }), slug }),
    };
  });
}

const SYSTEM_PROMPT = [
  'You turn a prepared market-event evidence pack into a Kansoku canvas.',
  'The pack already contains the event, cluster siblings, prices, volume, flow, comments, and research.',
  'Do not fetch new data. Do not invent numbers that are not in the pack.',
  'If a price or peer item has coverage "unavailable", write that gap in the canvas. Do not present later bars as the event window.',
  'Use only these @kansoku/canvas names: Canvas, Section, Grid, Row, Stack, Card, H1, H2, H3, Heading, Text, Stat, Metric, Table, Pill, Badge, Link, Callout, Divider.',
  'Table columns are {key, header}[] and rows are objects, or string[] columns with array rows.',
  'Arrange the evidence as TSX, then call save_canvas.',
  'You must use the exact slug you are given. The same event always overwrites the same canvas.',
].join('\n');

export async function runEventCanvasPersona(input: {
  pack: EventEvidencePack;
  slug: string;
  title: string;
  canvasDir: string;
}): Promise<void> {
  const model = aiConfig().chatModel ?? aiConfig().analystModel;
  if (!model) {
    throw new Error('no model configured for event canvas');
  }
  const session = createAgentSession({
    layer: 'assistant',
    symbol: input.pack.event.symbols[0] ?? 'MACRO',
    origin: `event-canvas:${input.pack.event.id}`,
    model,
    systemPrompt: SYSTEM_PROMPT,
    tools: bindCanvasSlug(buildCanvasTools(input.canvasDir), input.slug),
  });
  await session.runTurn(
    [
      `Save a canvas with slug=${input.slug} and title=${JSON.stringify(input.title)}.`,
      'Evidence pack JSON:',
      JSON.stringify(input.pack),
    ].join('\n'),
    180_000,
  );
}
