import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * Packaged builds ship agent skills under Resources/skills. The kernel still
 * looks for `.claude/skills` under TRADE_PROJECT_ROOT (data root), and bash
 * tools run with that root as cwd. Link the bundled tree into the data root
 * so SKILL.md reads and script paths both work.
 */
export function ensureBundledSkills(dataRoot: string, bundledSkillsDir: string): boolean {
  if (!existsSync(bundledSkillsDir)) return false;

  const target = join(dataRoot, ".claude", "skills");
  mkdirSync(dirname(target), { recursive: true });

  if (existsSync(target)) {
    try {
      const st = lstatSync(target);
      if (st.isSymbolicLink()) {
        const current = readlinkSync(target);
        const currentAbs = current.startsWith("/") ? current : join(dirname(target), current);
        if (samePath(currentAbs, bundledSkillsDir)) return true;
        rmSync(target);
      } else if (st.isDirectory() && existsSync(join(target, "intraday-signal", "SKILL.md"))) {
        // User/data already has a real skills tree — leave it alone.
        return true;
      } else {
        rmSync(target, { recursive: true, force: true });
      }
    } catch {
      try {
        rmSync(target, { recursive: true, force: true });
      } catch {
        return false;
      }
    }
  }

  try {
    symlinkSync(bundledSkillsDir, target, "dir");
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
  return join(resourcesPath, "skills");
}
