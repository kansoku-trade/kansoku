import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROJECT_ROOT } from '../../platform/env.js';

export type SkillRuntime = 'app' | 'bench';

export type SkillMeta = {
  name: string;
  description: string;
  dir: string;
  /**
   * Absolute paths of the reference chapters this runtime appends after SKILL.md, name-sorted.
   * Optional because callers hand `buildResearchTools` their own index; `readSkill` treats a
   * missing list as "core only" rather than throwing.
   */
  references?: string[];
};

const REFERENCES_DIR = 'references';

export const SKILLS_POLICY_FILE = 'skills-policy.json';

export interface SkillsPolicy {
  /**
   * Skills that live in .claude/skills for Claude Code sessions but have no place in the app
   * runtime. They stay installed and readable from a terminal; they are only kept out of the
   * catalog the app injects, where every description costs tokens on the first turn.
   *
   * App-only skills are NOT listed here — they are enforced by living under a root that external
   * agents never scan, so listing them would create a second source of truth.
   */
  agentOnly: readonly string[];
}

const EMPTY_POLICY: SkillsPolicy = { agentOnly: [] };

/**
 * A packaged build has no policy file: `stageSkills` already dropped the agent-only skills, and
 * PROJECT_ROOT there points at the user's workspace rather than the repo. Missing therefore means
 * "nothing left to filter", not "broken" — the guard against a policy file that goes missing in a
 * dev checkout is the audit snapshot test, not a throw here.
 */
export function loadSkillsPolicy(repoRoot: string): SkillsPolicy {
  try {
    const raw = JSON.parse(readFileSync(join(repoRoot, SKILLS_POLICY_FILE), 'utf8')) as unknown;
    const agentOnly = (raw as { agentOnly?: unknown }).agentOnly;
    if (!Array.isArray(agentOnly)) return EMPTY_POLICY;
    return { agentOnly: agentOnly.filter((name): name is string => typeof name === 'string') };
  } catch {
    return EMPTY_POLICY;
  }
}

function parseFrontmatterField(frontmatter: string, field: string): string {
  const lines = frontmatter.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (startIdx === -1) return '';

  const firstLine = lines[startIdx].slice(field.length + 1).trim();
  // YAML block scalars carry an optional chomping indicator: `>`, `>-`, `|+`, and so on.
  // Missing the suffixed forms used to leave the description as the literal ">-".
  if (/^[>|][-+]?$/.test(firstLine)) {
    const parts: string[] = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === '' || !/^\s/.test(line)) break;
      parts.push(line.trim());
    }
    return parts.join(' ');
  }
  return firstLine;
}

function parseSkillMd(content: string): { name: string; description: string } | null {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return null;
  const frontmatter = content.slice(3, end).replace(/^\n/, '');

  const name = parseFrontmatterField(frontmatter, 'name');
  if (!name) return null;
  const description = parseFrontmatterField(frontmatter, 'description');
  return { name, description };
}

export interface LoadSkillIndexOptions {
  /** Repo root used to locate the policy file. Defaults to PROJECT_ROOT so filtering is never off
   *  by accident — a caller that forgets the option still gets the audience boundary. */
  repoRoot?: string;
  /**
   * Which runtime this index serves. A skill's SKILL.md holds only what every runtime can execute;
   * environment-specific chapters live in `references/<runtime>/` and are resolved here, once,
   * rather than per read_skill call — the runtime is a property of who built the index, not of the
   * call, and composing inside the agent loop would mean extra blocking reads every turn.
   */
  runtime?: SkillRuntime;
}

function resolveReferences(skillDir: string, runtime: SkillRuntime | undefined): string[] {
  if (!runtime) return [];
  const dir = join(skillDir, REFERENCES_DIR, runtime);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => join(dir, entry));
}

export function loadSkillIndex(dirs: string[], opts: LoadSkillIndexOptions = {}): SkillMeta[] {
  const hidden = new Set(loadSkillsPolicy(opts.repoRoot ?? PROJECT_ROOT).agentOnly);
  const result: SkillMeta[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const entryDir = resolve(join(dir, entry));
      if (!statSync(entryDir).isDirectory()) continue;
      const skillPath = join(entryDir, 'SKILL.md');
      if (!existsSync(skillPath)) continue;

      const parsed = parseSkillMd(readFileSync(skillPath, 'utf8'));
      if (!parsed) continue;
      if (hidden.has(parsed.name)) continue;
      if (seen.has(parsed.name)) continue;
      seen.add(parsed.name);
      result.push({
        name: parsed.name,
        description: parsed.description,
        dir: entryDir,
        references: resolveReferences(entryDir, opts.runtime),
      });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkill(index: SkillMeta[], name: string): string | null {
  const meta = index.find((s) => s.name === name);
  if (!meta) return null;
  const parts = [readFileSync(join(meta.dir, 'SKILL.md'), 'utf8')];
  for (const reference of meta.references ?? []) {
    const text = readFileSync(reference, 'utf8');
    if (text.trim()) parts.push(text);
  }
  return parts.join('\n\n---\n\n');
}
