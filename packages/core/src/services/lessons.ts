import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JOURNAL_DIR } from "../env.js";

const MAX_LESSONS = 12;
// Entries run long (200+ chars each), so a count cap alone lets the payload blow up.
const MAX_CHARS = 4000;

export async function readActiveLessons(): Promise<string[]> {
  try {
    const text = await readFile(join(JOURNAL_DIR, "lessons.md"), "utf8");
    // Honour an explicit "## 现行教训" section when the file has one; otherwise read the whole
    // file, which is the shape lessons.md actually has — flat bullets, newest first.
    const section = text.split(/^## /m).find((s) => s.startsWith("现行教训")) ?? text;

    const picked: string[] = [];
    let chars = 0;
    for (const line of section.split("\n")) {
      if (!line.startsWith("- ")) continue;
      const lesson = line.slice(2).trim();
      if (!lesson) continue;
      if (picked.length >= MAX_LESSONS) break;
      if (picked.length > 0 && chars + lesson.length > MAX_CHARS) break;
      picked.push(lesson);
      chars += lesson.length;
    }
    return picked;
  } catch {
    return [];
  }
}
