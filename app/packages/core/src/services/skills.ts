import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export type SkillMeta = { name: string; description: string; dir: string };

function parseFrontmatterField(frontmatter: string, field: string): string {
  const lines = frontmatter.split("\n");
  const startIdx = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (startIdx === -1) return "";

  const firstLine = lines[startIdx].slice(field.length + 1).trim();
  if (firstLine === ">" || firstLine === "|") {
    const parts: string[] = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === "" || !/^\s/.test(line)) break;
      parts.push(line.trim());
    }
    return parts.join(" ");
  }
  return firstLine;
}

function parseSkillMd(content: string): { name: string; description: string } | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const frontmatter = content.slice(3, end).replace(/^\n/, "");

  const name = parseFrontmatterField(frontmatter, "name");
  if (!name) return null;
  const description = parseFrontmatterField(frontmatter, "description");
  return { name, description };
}

export function loadSkillIndex(dirs: string[]): SkillMeta[] {
  const result: SkillMeta[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const entryDir = resolve(join(dir, entry));
      if (!statSync(entryDir).isDirectory()) continue;
      const skillPath = join(entryDir, "SKILL.md");
      if (!existsSync(skillPath)) continue;

      const parsed = parseSkillMd(readFileSync(skillPath, "utf8"));
      if (!parsed) continue;
      if (seen.has(parsed.name)) continue;
      seen.add(parsed.name);
      result.push({ name: parsed.name, description: parsed.description, dir: entryDir });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkill(index: SkillMeta[], name: string): string | null {
  const meta = index.find((s) => s.name === name);
  if (!meta) return null;
  return readFileSync(join(meta.dir, "SKILL.md"), "utf8");
}
