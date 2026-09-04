import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, skillSearchDirs } from '../../platform/env.js';
import { loadSkillIndex, loadSkillsPolicy } from './skills.js';

export interface SkillAuditRow {
  name: string;
  /** Search root the skill resolved from, repo-relative. */
  root: string;
  appVisible: boolean;
  /** Chapter file names the app runtime appends, without the directory prefix. */
  appChapters: string[];
}

export interface SkillAudit {
  rows: SkillAuditRow[];
  /** agentOnly entries that match no directory under any root — a rename left them behind. */
  staleAgentOnly: string[];
}

/**
 * Resolved view of the audience boundary. The exception list in skills-policy.json is short by
 * design, so this is the readable full picture — generated rather than hand-maintained, which is
 * the only way it stays true. A snapshot test turns it into the gate that forces a look whenever
 * an install changes what the app can see.
 */
export function auditSkills(repoRoot: string = PROJECT_ROOT): SkillAudit {
  const dirs = skillSearchDirs(repoRoot);
  const index = loadSkillIndex(dirs, { repoRoot, runtime: 'app' });
  const agentOnly = loadSkillsPolicy(repoRoot).agentOnly;

  const rows: SkillAuditRow[] = index.map((skill) => ({
    name: skill.name,
    root: path.relative(repoRoot, path.dirname(skill.dir)),
    appVisible: true,
    appChapters: (skill.references ?? []).map((file) => path.basename(file)),
  }));

  for (const name of agentOnly) {
    const dir = dirs
      .map((root) => path.join(root, name))
      .find((candidate) => existsSync(candidate));
    if (!dir) continue;
    rows.push({
      name,
      root: path.relative(repoRoot, path.dirname(dir)),
      appVisible: false,
      appChapters: [],
    });
  }

  const present = new Set(dirs.filter((dir) => existsSync(dir)).flatMap((dir) => readdirSync(dir)));
  return {
    rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
    staleAgentOnly: agentOnly.filter((name) => !present.has(name)),
  };
}

export function formatSkillAudit(audit: SkillAudit): string {
  const lines = audit.rows.map(
    (row) =>
      `${row.appVisible ? 'app+agent' : 'agent-only'}  ${row.name.padEnd(28)} ${row.root}` +
      (row.appChapters.length > 0 ? `  +${row.appChapters.join(',')}` : ''),
  );
  return lines.join('\n');
}
