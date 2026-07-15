import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { skillSearchDirs } from "../env.js";
import { loadSkillIndex, readSkill, type SkillMeta } from "../services/skills.js";
import { buildResearchTools, type ExecFn, type ExecResult } from "./agentTools.js";
import { textResult } from "./dataTools.js";
import { deepDiveAdapterPrompt } from "./prompts.js";
import { composeWithDiscipline } from "./promptPolicy.js";

export type { ExecFn, ExecResult };

export const DEEP_DIVE_SKILL = "stock-deep-dive";

export function loadDeepDiveSkillText(repoRoot: string): string | null {
  return readSkill(loadSkillIndex(skillSearchDirs(repoRoot)), DEEP_DIVE_SKILL);
}

/**
 * The six-lens flow is preloaded in full rather than left to the model to fetch via read_skill.
 * Asking the model to load its own discipline means a run that silently skips read_skill still
 * counts as a success — the discipline becomes a request instead of a guarantee.
 *
 * Both texts are injected, not read here, so this stays a pure function; the runner owns the
 * fail-closed check.
 */
export function buildSystemPrompt(_repoRoot: string, deepDiveSkill: string, disciplineText = ""): string {
  const own = [deepDiveAdapterPrompt(), "", "---", "", deepDiveSkill].join("\n");
  return composeWithDiscipline(disciplineText, own);
}

const writeNoteSchema = Type.Object({ content: Type.String() });

export function buildTools(
  repoRoot: string,
  symbol: string,
  exec: ExecFn,
  stocksDir?: string,
  onNoteWritten?: () => void,
): { tools: AgentTool[]; skillIndex: SkillMeta[] } {
  const notesDir = stocksDir ?? join(repoRoot, "stocks");
  const { tools: researchTools, skillIndex } = buildResearchTools({ repoRoot, exec });

  const writeNoteTool: AgentTool<typeof writeNoteSchema> = {
    name: "write_note",
    label: "Write Note",
    description: `把 ${symbol} 更新后的笔记写入 stocks/${symbol}.md。这是持久化研究结论的唯一途径。`,
    parameters: writeNoteSchema,
    execute: async (_id, params) => {
      const content = params.content;
      if (!content.trim()) return textResult("rejected: content is empty");
      const path = join(notesDir, `${symbol}.md`);
      await fs.mkdir(notesDir, { recursive: true });
      await fs.writeFile(path, content, "utf8");
      onNoteWritten?.();
      return textResult(`written to stocks/${symbol}.md`);
    },
  };

  return { tools: [...researchTools, writeNoteTool], skillIndex };
}
