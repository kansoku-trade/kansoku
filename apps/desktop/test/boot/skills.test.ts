import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bundledSkillsPath, ensureBundledSkills } from "@desktop/boot/skills.js";

const temps: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ensureBundledSkills", () => {
  it("symlinks dataRoot/.claude/skills to the bundled skills tree", () => {
    const dataRoot = tempDir("kansoku-data-");
    const bundled = tempDir("kansoku-skills-");
    mkdirSync(join(bundled, "intraday-signal"), { recursive: true });
    writeFileSync(join(bundled, "intraday-signal", "SKILL.md"), "# skill\n");

    expect(ensureBundledSkills(dataRoot, bundled)).toBe(true);
    const target = join(dataRoot, ".claude", "skills");
    expect(existsSync(join(target, "intraday-signal", "SKILL.md"))).toBe(true);
    expect(readlinkSync(target)).toBe(bundled);
  });

  it("is a no-op when the symlink already points at the bundled tree", () => {
    const dataRoot = tempDir("kansoku-data-");
    const bundled = tempDir("kansoku-skills-");
    mkdirSync(join(bundled, "intraday-signal"), { recursive: true });
    writeFileSync(join(bundled, "intraday-signal", "SKILL.md"), "# skill\n");

    expect(ensureBundledSkills(dataRoot, bundled)).toBe(true);
    expect(ensureBundledSkills(dataRoot, bundled)).toBe(true);
  });

  it("returns false when the bundled skills dir is missing", () => {
    const dataRoot = tempDir("kansoku-data-");
    expect(ensureBundledSkills(dataRoot, join(dataRoot, "missing-skills"))).toBe(false);
  });
});

describe("bundledSkillsPath", () => {
  it("resolves Resources/skills", () => {
    expect(bundledSkillsPath("/App/Contents/Resources")).toBe("/App/Contents/Resources/skills");
  });
});
