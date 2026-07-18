import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildResearchTools, createDefaultExec } from "../src/ai/agentTools.js";
import type { SkillMeta } from "../src/services/skills.js";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "agent-tools-test-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function writeSkill(dir: string, name: string, content: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content);
}

describe("buildResearchTools", () => {
  it("returns exactly read_skill, bash, read_file in that order", () => {
    const { tools } = buildResearchTools({ repoRoot, skillIndex: [] });
    expect(tools.map((t) => t.name)).toEqual(["read_skill", "bash", "read_file"]);
  });

  it("uses a provided skillIndex as-is and returns it", async () => {
    const skillDir = join(repoRoot, "fake-skill");
    writeSkill(skillDir, "fake-skill", "---\nname: fake-skill\ndescription: fake\n---\nfake body");
    const skillIndex: SkillMeta[] = [{ name: "fake-skill", description: "fake", dir: skillDir }];

    const result = buildResearchTools({ repoRoot, skillIndex });
    expect(result.skillIndex).toBe(skillIndex);

    const readSkillTool = result.tools.find((t) => t.name === "read_skill")!;
    const res = await readSkillTool.execute("c1", { name: "fake-skill" });
    expect((res.content[0] as { text: string }).text).toContain("fake body");
  });

  it("loads the skill index from skillSearchDirs(repoRoot) when skillIndex is omitted", () => {
    writeSkill(join(repoRoot, ".claude", "skills", "foo"), "foo", "---\nname: foo\ndescription: foo skill\n---\nfoo body");

    const { skillIndex } = buildResearchTools({ repoRoot });
    expect(skillIndex.find((s) => s.name === "foo")).toBeDefined();
  });

  it("fires onSkillRead only after a successful read_skill execute", async () => {
    const skillDir = join(repoRoot, "fake-skill");
    writeSkill(skillDir, "fake-skill", "---\nname: fake-skill\ndescription: fake\n---\nfake body");
    const skillIndex: SkillMeta[] = [{ name: "fake-skill", description: "fake", dir: skillDir }];

    const readNames: string[] = [];
    const { tools } = buildResearchTools({ repoRoot, skillIndex, onSkillRead: (name) => readNames.push(name) });
    const readSkillTool = tools.find((t) => t.name === "read_skill")!;

    await readSkillTool.execute("c1", { name: "does-not-exist" });
    expect(readNames).toEqual([]);

    await readSkillTool.execute("c2", { name: "fake-skill" });
    expect(readNames).toEqual(["fake-skill"]);
  });

  it("default exec runs commands with an augmented PATH", async () => {
    const exec = createDefaultExec(repoRoot);
    const { stdout } = await exec("echo $PATH");
    const dirs = stdout.trim().split(":");
    expect(dirs).toContain("/opt/homebrew/bin");
    expect(dirs).toContain("/usr/local/bin");
  });

  it("uses a custom exec for the bash tool", async () => {
    const calls: string[] = [];
    const { tools } = buildResearchTools({
      repoRoot,
      skillIndex: [],
      exec: async (command) => {
        calls.push(command);
        return { stdout: "custom-output", stderr: "" };
      },
    });

    const bashTool = tools.find((t) => t.name === "bash")!;
    const res = await bashTool.execute("c1", { command: "echo hi" });

    expect(calls).toEqual(["echo hi"]);
    expect((res.content[0] as { text: string }).text).toContain("custom-output");
  });
});
