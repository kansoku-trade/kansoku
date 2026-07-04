import { promises as fs } from "node:fs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { CockpitComment } from "../../shared/types.js";

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? "/tmp/";
  const sep = base.endsWith("/") ? "" : "/";
  const dir = `${base}${sep}comments-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock("../src/env.js", () => ({ CHART_DATA_DIR: ctx.dir }));

const { appendComment, listComments, onComment } = await import("../src/ai/comments.js");

function comment(overrides: Partial<CockpitComment> = {}): CockpitComment {
  return {
    ts: "2026-07-02T15:00:00.000Z",
    symbol: "MU.US",
    level: "info",
    text: "hello",
    source: "commentator",
    ...overrides,
  };
}

afterEach(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

describe("comments storage", () => {
  it("appends and reads back in order", async () => {
    await appendComment(comment({ text: "first" }));
    await appendComment(comment({ text: "second", level: "warn" }));
    const list = await listComments("MU.US", "2026-07-02");
    expect(list.map((c) => c.text)).toEqual(["first", "second"]);
    expect(list[1].level).toBe("warn");
  });

  it("returns an empty list when the file is missing", async () => {
    expect(await listComments("NVDA.US", "2026-07-02")).toEqual([]);
  });

  it("groups by the US-Eastern date of the comment ts", async () => {
    await appendComment(comment({ ts: "2026-07-02T02:00:00.000Z", text: "late" }));
    expect(await listComments("MU.US", "2026-07-01")).toHaveLength(1);
    expect(await listComments("MU.US", "2026-07-02")).toEqual([]);
  });

  it("keeps dots in symbol filenames", async () => {
    await appendComment(comment({ symbol: "MRVL.US" }));
    const files = await fs.readdir(`${ctx.dir}/comments`);
    expect(files).toContain("MRVL.US-2026-07-02.json");
  });

  it("lands every comment under concurrent appends for one symbol", async () => {
    const texts = Array.from({ length: 8 }, (_, i) => `c${i}`);
    await Promise.all(texts.map((text) => appendComment(comment({ text }))));
    const list = await listComments("MU.US", "2026-07-02");
    expect(list.map((c) => c.text).sort()).toEqual([...texts].sort());
  });

  it("treats a non-array JSON file as empty and appends onto it", async () => {
    await fs.mkdir(`${ctx.dir}/comments`, { recursive: true });
    await fs.writeFile(`${ctx.dir}/comments/MU.US-2026-07-02.json`, "{}");
    expect(await listComments("MU.US", "2026-07-02")).toEqual([]);
    await expect(appendComment(comment({ text: "recovered" }))).resolves.toBeUndefined();
    const list = await listComments("MU.US", "2026-07-02");
    expect(list.map((c) => c.text)).toEqual(["recovered"]);
  });
});

describe("comment event bus", () => {
  it("broadcasts appended comments to the matching symbol", async () => {
    const received: CockpitComment[] = [];
    const unsub = onComment("MU.US", (c) => received.push(c));
    await appendComment(comment({ text: "live" }));
    expect(received.map((c) => c.text)).toEqual(["live"]);
    unsub();
    await appendComment(comment({ text: "after-unsub" }));
    expect(received).toHaveLength(1);
  });

  it("does not deliver comments for other symbols", async () => {
    const received: CockpitComment[] = [];
    const unsub = onComment("NVDA.US", (c) => received.push(c));
    await appendComment(comment({ symbol: "MU.US" }));
    expect(received).toHaveLength(0);
    unsub();
  });

  it("isolates a throwing listener from later listeners and the append", async () => {
    const received: CockpitComment[] = [];
    const unsubBad = onComment("MU.US", () => {
      throw new Error("boom");
    });
    const unsubGood = onComment("MU.US", (c) => received.push(c));
    await expect(appendComment(comment({ text: "survives" }))).resolves.toBeUndefined();
    expect(received.map((c) => c.text)).toEqual(["survives"]);
    unsubBad();
    unsubGood();
  });
});
