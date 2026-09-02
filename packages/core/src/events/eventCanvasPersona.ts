import type { AgentTool } from '@earendil-works/pi-agent-core';
import { canvasComponentNames } from '@kansoku/canvas/names';
import { buildCanvasTools, CANVAS_SKILL_NAME } from '../canvas/tools.js';
import { buildReadFileTool } from '../ai/agents/agentTools/fileTools.js';
import { createAgentSession } from '../ai/agents/agentSession.js';
import { loadSkillIndex, readSkill } from '../ai/agents/skills.js';
import { PROJECT_ROOT, skillSearchDirs } from '../platform/env.js';
import { aiConfig } from '../ai/runtime/models.js';

import type { EventEvidencePack } from './evidencePack.js';

// This persona has no read_skill tool and writes a canvas on every run, so there is nothing
// to save by loading the guide on demand — inject it the way the analyst persona does.
function canvasSkillText(): string | null {
  try {
    return readSkill(loadSkillIndex(skillSearchDirs(PROJECT_ROOT)), CANVAS_SKILL_NAME);
  } catch {
    return null;
  }
}

const EXCLUDED_TOOLS = new Set(['save_canvas_data', 'snapshot_candles']);

function bindCanvasSlug(tools: AgentTool[], slug: string): AgentTool[] {
  return tools
    .filter((tool) => !EXCLUDED_TOOLS.has(tool.name))
    .map((tool) => {
      if (tool.name !== 'save_canvas') return tool;
      return {
        ...tool,
        execute: async (id, params) => tool.execute(id, { ...(params as { slug?: string }), slug }),
      };
    });
}

const SYSTEM_PROMPT = [
  'You turn a prepared market-event evidence pack into a Kansoku canvas.',
  'The pack already contains the event, cluster siblings, prices, volume, flow, comments, and research.',
  'Do not fetch new data. Do not invent numbers that are not in the pack.',
  'If a price or peer item has coverage "unavailable", write that gap in the canvas. Do not present later bars as the event window.',
  `Use only these @kansoku/canvas names: ${canvasComponentNames(['layout', 'text', 'data', 'analysis']).join(', ')}.`,
  'Table columns are {key, header}[] and rows are objects, or string[] columns with array rows.',
  'The canvas skill below is authoritative for layout. For exact prop shapes, read_file the declarations under .claude/skills/canvas/sdk/ rather than guessing — an invented prop is silently dropped.',
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
  const skillText = canvasSkillText();
  const session = createAgentSession({
    layer: 'assistant',
    symbol: input.pack.event.symbols[0] ?? 'MACRO',
    origin: `event-canvas:${input.pack.event.id}`,
    model,
    systemPrompt: skillText
      ? [
          SYSTEM_PROMPT,
          '',
          '<activated_skill name="canvas">',
          skillText,
          '</activated_skill>',
        ].join('\n')
      : SYSTEM_PROMPT,
    // The skill points at the SDK source for exact prop shapes. Without a reader this
    // persona invented props (`Callout title`, `Source url`) that silently dropped.
    tools: [
      ...bindCanvasSlug(buildCanvasTools(input.canvasDir), input.slug),
      buildReadFileTool(PROJECT_ROOT),
    ],
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
