import { exec as nodeExec } from "node:child_process";
import { promises as fs } from "node:fs";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { readSkill, type SkillMeta } from "../services/skills.js";
import { textResult } from "./dataTools.js";

const OUTPUT_TRUNCATE_CHARS = 30_000;
const READ_FILE_MAX_CHARS = 100_000;
const REJECTED_PATTERNS = [/>>?/, /\btee\s/, /\brm\s/, /\bmv\s/, /\bcp\s/];
const BASH_TIMEOUT_MS = 120_000;
const BASH_MAX_BUFFER = 10 * 1024 * 1024;

export type ExecResult = { stdout: string; stderr: string };
export type ExecFn = (command: string) => Promise<ExecResult>;

const nodeExecAsync = promisify(nodeExec);

export function createDefaultExec(repoRoot: string): ExecFn {
  return async (command: string) => {
    const { stdout, stderr } = await nodeExecAsync(command, {
      cwd: repoRoot,
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: BASH_MAX_BUFFER,
    });
    return { stdout, stderr };
  };
}

export function truncateOutput(text: string): string {
  if (text.length <= OUTPUT_TRUNCATE_CHARS) return text;
  return `${text.slice(0, OUTPUT_TRUNCATE_CHARS)}\n...[truncated]`;
}

export function isRejectedCommand(command: string): boolean {
  return REJECTED_PATTERNS.some((re) => re.test(command));
}

export function resolveRepoRelative(repoRoot: string, rawPath: string): string | null {
  const resolved = resolve(repoRoot, rawPath);
  const rel = relative(repoRoot, resolved);
  if (rel.startsWith("..") || resolve(repoRoot, rel) !== resolved) return null;
  return resolved;
}

const readSkillSchema = Type.Object({ name: Type.String() });
const bashSchema = Type.Object({ command: Type.String() });
const readFileSchema = Type.Object({ path: Type.String() });

export function buildReadSkillTool(
  skillIndex: SkillMeta[],
  onRead?: (name: string) => void,
): AgentTool<typeof readSkillSchema> {
  return {
    name: "read_skill",
    label: "Read Skill",
    description: "Load the full SKILL.md text for a named skill.",
    parameters: readSkillSchema,
    execute: async (_id, params) => {
      const text = readSkill(skillIndex, params.name);
      if (text) onRead?.(params.name);
      return textResult(text ?? `unknown skill: ${params.name}`);
    },
  };
}

export function buildBashTool(exec: ExecFn): AgentTool<typeof bashSchema> {
  return {
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
        return textResult(truncateOutput(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`));
      } catch (err) {
        return textResult(`command failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export function buildReadFileTool(repoRoot: string): AgentTool<typeof readFileSchema> {
  return {
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
}
