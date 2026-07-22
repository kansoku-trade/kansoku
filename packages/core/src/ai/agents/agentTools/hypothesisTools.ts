import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { ClientError } from '../../../platform/errors.js';
import { createHypothesis, listHypotheses } from '../../../journal/hypotheses.js';
import { textResult } from '../dataTools.js';

const registerSchema = Type.Object({
  thesis: Type.String({
    description: 'The thesis in one sentence: why this will go up or down.',
  }),
  symbol: Type.Optional(Type.String({ description: 'Symbol the thesis is about, e.g. MU.US.' })),
  invalidation_notes: Type.Array(
    Type.String({ description: 'One concrete condition that would falsify the thesis.' }),
    { minItems: 1, maxItems: 6 },
  ),
});

const emptySchema = Type.Object({});

export function buildHypothesisTools(
  opts: { symbol?: string; dir?: string } = {},
): AgentTool[] {
  const listTool: AgentTool<typeof emptySchema> = {
    name: 'list_hypotheses',
    label: 'List Hypotheses',
    description:
      "List the user's active registered hypotheses (id, thesis, symbol, falsifiers). Call this before register_hypothesis to avoid duplicates, or when the user asks what theses are on record.",
    parameters: Type.Object({}),
    execute: async () => {
      const rows = (await listHypotheses(opts.dir)).filter((h) => h.status === 'active');
      return textResult(
        JSON.stringify(
          rows.map(({ id, thesis, symbol, invalidation_notes }) => ({
            id,
            thesis,
            ...(symbol ? { symbol } : {}),
            invalidation_notes,
          })),
        ),
      );
    },
  };

  const registerTool: AgentTool<typeof registerSchema> = {
    name: 'register_hypothesis',
    label: 'Register Hypothesis',
    description:
      'Register a new hypothesis in the research library. Use ONLY when the user explicitly asks to record a thesis; never register one on your own initiative during analysis. Requires at least one concrete falsifier. Check list_hypotheses first to avoid duplicates.',
    parameters: registerSchema,
    execute: async (_id, params) => {
      try {
        const hypothesis = await createHypothesis(
          {
            thesis: params.thesis,
            ...(params.symbol ?? opts.symbol ? { symbol: params.symbol ?? opts.symbol } : {}),
            invalidation_notes: params.invalidation_notes,
          },
          opts.dir,
        );
        return textResult(JSON.stringify({ id: hypothesis.id, status: hypothesis.status }));
      } catch (err) {
        if (err instanceof ClientError) return textResult(`rejected: ${err.message}`);
        throw err;
      }
    },
  };

  return [listTool, registerTool];
}
