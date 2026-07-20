import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { createResearchService } from '../../research/research.service.js';
import { textResult } from './dataTools.js';

const searchSchema = Type.Object({ query: Type.String() });
const readDocumentSchema = Type.Object({ path: Type.String() });

export function buildResearchLibraryTools(rootDir: string): AgentTool<any>[] {
  const library = createResearchService(rootDir);
  const searchTool: AgentTool<typeof searchSchema> = {
    name: 'search_research_documents',
    label: 'Search Research Library',
    description: 'Search local research materials by title, path, symbol, excerpt, and body; returns at most eight metadata records.',
    parameters: searchSchema,
    execute: async (_id, params) => {
      const rows = await library.list({ query: params.query });
      return textResult(JSON.stringify(rows.slice(0, 8)));
    },
  };
  const readTool: AgentTool<typeof readDocumentSchema> = {
    name: 'read_research_document',
    label: 'Read Research Document',
    description: 'Read another stocks/*.md or journal/**/*.md document from the research library.',
    parameters: readDocumentSchema,
    execute: async (_id, params) => {
      const document = await library.get({ path: params.path });
      return textResult(document.markdown);
    },
  };
  return [searchTool, readTool];
}
