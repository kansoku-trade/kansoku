import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const journalDir = mkdtempSync(join(tmpdir(), "lessons-"));

vi.mock("../src/env.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/env.js")>()),
  JOURNAL_DIR: journalDir,
}));

const { readActiveLessons } = await import("../src/services/lessons.js");

function writeLessons(text: string): void {
  writeFileSync(join(journalDir, "lessons.md"), text, "utf8");
}

afterEach(() => vi.resetModules());

describe("readActiveLessons", () => {
  // The real journal/lessons.md is flat bullets under a single H1 — no "## 现行教训" section.
  // Requiring that heading made this return [] for every lesson ever written.
  it("reads flat bullets when there is no 现行教训 section", async () => {
    writeLessons(["# 复盘教训清单", "", "---", "", "- 第一条教训", "- 第二条教训"].join("\n"));
    expect(await readActiveLessons()).toEqual(["第一条教训", "第二条教训"]);
  });

  it("still honours an explicit 现行教训 section", async () => {
    writeLessons(["# 清单", "", "## 归档", "- 旧的", "", "## 现行教训", "- 新的"].join("\n"));
    expect(await readActiveLessons()).toEqual(["新的"]);
  });

  it("caps by character budget, not just count", async () => {
    const long = "x".repeat(1500);
    writeLessons(["# 清单", "", ...Array.from({ length: 6 }, () => `- ${long}`)].join("\n"));
    const lessons = await readActiveLessons();
    expect(lessons.length).toBeLessThan(6);
    expect(lessons.join("").length).toBeLessThanOrEqual(4000);
  });

  it("always keeps at least one lesson even if it blows the budget", async () => {
    writeLessons(["# 清单", "", `- ${"y".repeat(9000)}`].join("\n"));
    expect(await readActiveLessons()).toHaveLength(1);
  });

  it("returns [] when the file is missing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "lessons-empty-"));
    vi.resetModules();
    vi.doMock("../src/env.js", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/env.js")>()),
      JOURNAL_DIR: empty,
    }));
    const mod = await import("../src/services/lessons.js");
    expect(await mod.readActiveLessons()).toEqual([]);
  });
});
