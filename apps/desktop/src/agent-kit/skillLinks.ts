import {
  accessSync,
  constants,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import path from 'node:path';
import { removeLegacyBundledSkillsLink } from '../boot/skills.js';

const AGENT_KIT_SKILL_LINK_PATHS = ['.agent/skill'] as const;
const LEGACY_CLAUDE_SKILL_LINK = '.claude/skills';

function bundledSkillProbe(skillsDir: string): string {
  let entries: string[];
  try {
    if (!statSync(skillsDir).isDirectory()) {
      throw new Error('not a directory');
    }
    entries = readdirSync(skillsDir);
  } catch (error) {
    throw new Error(`agentKit: bundled skills directory is unavailable at ${skillsDir}`, {
      cause: error,
    });
  }

  const skillName = entries.find((name) => {
    try {
      accessSync(path.join(skillsDir, name, 'SKILL.md'), constants.R_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!skillName) {
    throw new Error(`agentKit: bundled skills directory has no readable SKILL.md at ${skillsDir}`);
  }
  return path.join(skillName, 'SKILL.md');
}

function isValidSkillLink(dest: string, skillsDir: string, probe: string): boolean {
  try {
    if (!lstatSync(dest).isSymbolicLink()) return false;
    if (realpathSync(dest) !== realpathSync(skillsDir)) return false;
    accessSync(path.join(dest, probe), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Project the packaged skill tree into every Agent Kit client location.
 *
 * These links are a managed runtime invariant rather than conflict-aware
 * templates: every sync repairs deletion, retargeting, and replacement with a
 * regular file or directory. The post-write check resolves the final path and
 * reads through the link so a misplaced or dangling link cannot pass silently.
 */
export function ensureAgentKitSkillLinks(agentKitDir: string, resourcesPath: string): void {
  const skillsDir = path.join(resourcesPath, 'skills');
  const probe = bundledSkillProbe(skillsDir);
  removeLegacyBundledSkillsLink(agentKitDir, skillsDir);

  for (const relativePath of AGENT_KIT_SKILL_LINK_PATHS) {
    const dest = path.join(agentKitDir, relativePath);
    if (!isValidSkillLink(dest, skillsDir, probe)) {
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(path.dirname(dest), { recursive: true });
      symlinkSync(skillsDir, dest, 'dir');
    }
    if (!isValidSkillLink(dest, skillsDir, probe)) {
      throw new Error(
        `agentKit: skill link verification failed for ${dest}; expected target ${skillsDir}`,
      );
    }
  }
}

/** Remove Kit-managed links without deleting real directories placed there by a user. */
export function cleanAgentKitSkillLinks(agentKitDir: string): void {
  for (const relativePath of [...AGENT_KIT_SKILL_LINK_PATHS, LEGACY_CLAUDE_SKILL_LINK]) {
    const dest = path.join(agentKitDir, relativePath);
    try {
      if (lstatSync(dest).isSymbolicLink()) rmSync(dest, { force: true });
    } catch {
      // Missing or unreadable destinations require no cleanup.
    }
  }
}
