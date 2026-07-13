import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { skillSearchDirs } from "../env.js";
import { loadSkillIndex, skillIndexPrompt } from "../services/skills.js";
import { buildBashTool, buildReadFileTool, buildReadSkillTool, type ExecFn, type ExecResult } from "./agentTools.js";
import { textResult } from "./dataTools.js";

export type { ExecFn, ExecResult };

export function buildSystemPrompt(repoRoot: string): string {
  const index = loadSkillIndex(skillSearchDirs(repoRoot));
  return [
    "You are an equity research agent maintaining per-stock six-lens notes in this repo.",
    "Available skills:",
    skillIndexPrompt(index),
    "Tool usage rules:",
    "- Use read_skill to load a skill's full instructions before following its flow.",
    "- Use bash to run the longbridge CLI and python scripts under .claude/skills; NEVER write files via bash (no redirection, tee, rm, mv, cp).",
    "- Use read_file to inspect repo-relative files (e.g. an existing stocks/{SYMBOL}.md note).",
    "- write_note is the ONLY way to persist your findings; it always writes stocks/{SYMBOL}.md for the symbol you were asked to research.",
    "Note-writing rules:",
    "- Update the existing note incrementally; do not discard prior sections unless they are stale.",
    "- Write the note content in modern vernacular Chinese (中文白话).",
    "- Keep tickers and CLI/API names (e.g. NVDA, longbridge) in English.",
  ].join("\n");
}

const writeNoteSchema = Type.Object({ content: Type.String() });

export function buildTools(repoRoot: string, symbol: string, exec: ExecFn, stocksDir?: string): AgentTool[] {
  const skillIndex = loadSkillIndex(skillSearchDirs(repoRoot));
  const notesDir = stocksDir ?? join(repoRoot, "stocks");

  const writeNoteTool: AgentTool<typeof writeNoteSchema> = {
    name: "write_note",
    label: "Write Note",
    description: `Write the updated note for ${symbol} to stocks/${symbol}.md. This is the only way to persist findings.`,
    parameters: writeNoteSchema,
    execute: async (_id, params) => {
      const content = params.content;
      if (!content.trim()) return textResult("rejected: content is empty");
      const path = join(notesDir, `${symbol}.md`);
      await fs.mkdir(notesDir, { recursive: true });
      await fs.writeFile(path, content, "utf8");
      return textResult(`written to stocks/${symbol}.md`);
    },
  };

  return [buildReadSkillTool(skillIndex), buildBashTool(exec), buildReadFileTool(repoRoot), writeNoteTool];
}
