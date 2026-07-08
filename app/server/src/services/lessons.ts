import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JOURNAL_DIR } from "../env.js";

const MAX_LESSONS = 12;

export async function readActiveLessons(): Promise<string[]> {
  try {
    const text = await readFile(join(JOURNAL_DIR, "lessons.md"), "utf8");
    const active = text.split(/^## /m).find((s) => s.startsWith("现行教训"));
    if (!active) return [];
    return active
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .slice(0, MAX_LESSONS);
  } catch {
    return [];
  }
}
