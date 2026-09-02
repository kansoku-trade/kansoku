import type { AgentTool } from '@earendil-works/pi-agent-core';
import { skillSearchDirs } from '../../../platform/env.js';
import { loadSkillIndex, type SkillMeta } from '../skills.js';
import { createDefaultExec, type ExecFn, buildBashTool } from './execTool.js';
import { buildReadSkillTool } from './skillTool.js';

export interface ResearchToolsOptions {
  repoRoot: string;
  exec?: ExecFn;
  skillIndex?: SkillMeta[];
  onSkillRead?: (name: string) => void;
}

export function buildResearchTools(opts: ResearchToolsOptions): {
  tools: AgentTool[];
  skillIndex: SkillMeta[];
} {
  const exec = opts.exec ?? createDefaultExec(opts.repoRoot);
  const skillIndex = opts.skillIndex ?? loadSkillIndex(skillSearchDirs(opts.repoRoot));
  return {
    tools: [buildReadSkillTool(skillIndex, opts.onSkillRead), buildBashTool(exec)],
    skillIndex,
  };
}
