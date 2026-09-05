import type { AgentTool } from '@earendil-works/pi-agent-core';
import { skillSearchDirs } from '../../../platform/env.js';
import { loadSkillIndex, type SkillMeta } from '../skills.js';
import {
  buildBashTool,
  buildReadBashTranscriptTool,
  createDefaultExec,
  type ExecFn,
} from './execTool.js';
import { buildReadSkillTool } from './skillTool.js';
import { isWebSearchConfigured } from '../../websearch/index.js';
import { buildWebSearchTool, type WebSearchRunner } from './webSearchTool.js';

export interface ResearchToolsOptions {
  repoRoot: string;
  exec?: ExecFn;
  skillIndex?: SkillMeta[];
  webSearch?: WebSearchRunner;
  /** Overrides the settings lookup that decides whether `web_search` is offered at all. */
  webSearchConfigured?: boolean;
  onSkillRead?: (name: string) => void;
}

export async function buildResearchTools(opts: ResearchToolsOptions): Promise<{
  tools: AgentTool[];
  skillIndex: SkillMeta[];
}> {
  const exec = opts.exec ?? createDefaultExec(opts.repoRoot);
  const skillIndex =
    opts.skillIndex ??
    loadSkillIndex(skillSearchDirs(opts.repoRoot), { repoRoot: opts.repoRoot, runtime: 'app' });
  const webSearchConfigured = opts.webSearchConfigured ?? (await isWebSearchConfigured());
  return {
    tools: [
      buildReadSkillTool(skillIndex, opts.onSkillRead),
      buildBashTool(exec),
      buildReadBashTranscriptTool(),
      ...(webSearchConfigured ? [buildWebSearchTool(opts.webSearch)] : []),
    ],
    skillIndex,
  };
}
