import { promises as fs } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { loadSkillIndex, readSkill, skillIndexPrompt } from "../services/skills.js";

const OUTPUT_TRUNCATE_CHARS = 30_000;
const READ_FILE_MAX_CHARS = 100_000;
const REJECTED_PATTERNS = [/>>?/, /\btee\s/, /\brm\s/, /\bmv\s/, /\bcp\s/];

export type ExecResult = { stdout: string; stderr: string };
export type ExecFn = (command: string) => Promise<ExecResult>;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

function truncate(text: string): string {
  if (text.length <= OUTPUT_TRUNCATE_CHARS) return text;
  return `${text.slice(0, OUTPUT_TRUNCATE_CHARS)}\n...[truncated]`;
}

function isRejectedCommand(command: string): boolean {
  return REJECTED_PATTERNS.some((re) => re.test(command));
}

function resolveRepoRelative(repoRoot: string, rawPath: string): string | null {
  const resolved = resolve(repoRoot, rawPath);
  const rel = relative(repoRoot, resolved);
  if (rel.startsWith("..") || resolve(repoRoot, rel) !== resolved) return null;
  return resolved;
}

export function buildSystemPrompt(repoRoot: string): string {
  const index = loadSkillIndex([join(repoRoot, ".claude", "skills")]);
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

const readSkillSchema = Type.Object({ name: Type.String() });
const bashSchema = Type.Object({ command: Type.String() });
const readFileSchema = Type.Object({ path: Type.String() });
const writeNoteSchema = Type.Object({ content: Type.String() });

export function buildTools(repoRoot: string, symbol: string, exec: ExecFn, stocksDir?: string): AgentTool[] {
  const skillIndex = loadSkillIndex([join(repoRoot, ".claude", "skills")]);
  const notesDir = stocksDir ?? join(repoRoot, "stocks");

  const readSkillTool: AgentTool<typeof readSkillSchema> = {
    name: "read_skill",
    label: "Read Skill",
    description: "Load the full SKILL.md text for a named skill.",
    parameters: readSkillSchema,
    execute: async (_id, params) => {
      const text = readSkill(skillIndex, params.name);
      return textResult(text ?? `unknown skill: ${params.name}`);
    },
  };

  const bashTool: AgentTool<typeof bashSchema> = {
    name: "bash",
    label: "Bash",
    description: "Run a shell command (cwd = repo root). Read-only commands only; no file writes.",
    parameters: bashSchema,
    execute: async (_id, params) => {
      const command = params.command;
      if (isRejectedCommand(command)) {
        return textResult(`rejected: command "${command}" matches a disallowed write pattern`);
      }
      try {
        const { stdout, stderr } = await exec(command);
        return textResult(truncate(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`));
      } catch (err) {
        return textResult(`command failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };

  const readFileTool: AgentTool<typeof readFileSchema> = {
    name: "read_file",
    label: "Read File",
    description: "Read a repo-relative file (e.g. stocks/{SYMBOL}.md).",
    parameters: readFileSchema,
    execute: async (_id, params) => {
      const rawPath = params.path;
      const resolved = resolveRepoRelative(repoRoot, rawPath);
      if (!resolved) return textResult(`rejected: path escapes repo root: ${rawPath}`);
      try {
        const content = await fs.readFile(resolved, "utf8");
        return textResult(content.length > READ_FILE_MAX_CHARS ? content.slice(0, READ_FILE_MAX_CHARS) : content);
      } catch (err) {
        return textResult(`read failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };

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

  return [readSkillTool, bashTool, readFileTool, writeNoteTool];
}
