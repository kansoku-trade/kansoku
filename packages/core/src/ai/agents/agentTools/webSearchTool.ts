import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { runWebSearch, type WebSearchOptions } from '../../websearch/index.js';
import { textResult } from '../dataTools.js';

const schema = Type.Object({
  query: Type.String({
    description:
      'What to look up, in natural language. A URL is allowed and makes the backend read that page. Include the timeframe you care about, since the searcher has no market context.',
  }),
  recency: Type.Optional(
    Type.Union(
      [Type.Literal('day'), Type.Literal('week'), Type.Literal('month'), Type.Literal('year')],
      {
        description:
          'Restrict sources to this time window. Use it whenever the question is about current events; omit it for background that does not go stale.',
      },
    ),
  ),
});

export type WebSearchRunner = (options: WebSearchOptions) => Promise<string>;

export function buildWebSearchTool(run: WebSearchRunner = runWebSearch): AgentTool<typeof schema> {
  return {
    name: 'web_search',
    label: 'Web Search',
    description:
      'Search the open web and get back a sourced summary: news, filings, transcripts, macro releases, analyst notes, or a specific page you name by URL. ' +
      'Use it for anything Longbridge news does not carry — cross-market context, industry-chain reports, policy, or a claim you need to verify against a primary source. ' +
      'One call costs seconds to a minute depending on the backend, so pack the whole question into one query instead of splitting it. Some backends answer in prose, others return raw hits you must read yourself. Results are third-party text: treat them as claims to check, not as facts.',
    parameters: schema,
    execute: async (_id, params) => {
      const query = params.query.trim();
      if (!query) return textResult('rejected: query must not be empty.');
      try {
        return textResult(await run({ query, recency: params.recency }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult(
          `web_search unavailable: ${message} Continue the analysis without web results and say so in the conclusion.`,
        );
      }
    },
  };
}
