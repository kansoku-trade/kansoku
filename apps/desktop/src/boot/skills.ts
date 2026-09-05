import { existsSync, lstatSync, readlinkSync, realpathSync, rmSync, rmdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Older packaged builds exposed Resources/skills as Workspace/.claude/skills.
 * Skill discovery and bash now resolve the bundled directory independently, so
 * remove only that exact legacy link and leave user-owned directories untouched.
 */
export function removeLegacyBundledSkillsLink(dataRoot: string, bundledSkillsDir: string): boolean {
  const target = join(dataRoot, '.claude', 'skills');
  try {
    if (!existsSync(target) || !lstatSync(target).isSymbolicLink()) return false;
    const current = readlinkSync(target);
    const currentAbs = current.startsWith('/') ? current : join(dirname(target), current);
    if (!samePath(currentAbs, bundledSkillsDir)) return false;
    rmSync(target);
    try {
      rmdirSync(dirname(target));
    } catch {
      // Keep .claude when it contains user-owned files.
    }
    return true;
  } catch {
    return false;
  }
}

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
}

export function bundledSkillsPath(resourcesPath: string): string {
  return join(resourcesPath, 'skills');
}
