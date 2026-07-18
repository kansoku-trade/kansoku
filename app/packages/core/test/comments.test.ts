import { promises as fs } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { CockpitComment } from "../../../shared/types.js";

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? "/tmp/";
  const sep = base.endsWith("/") ? "" : "/";
  const dir = `${base}${sep}comments-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock("../src/env.js", () => ({ CHART_DATA_DIR: ctx.dir }));

const { appendComment, latestCommentatorRunAt, listComments, onAnyComment, onComment } = await import("../src/ai/comments.js");

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

  it("returns an empty list for a symbol without comments", async () => {
    expect(await listComments("NVDA.US", "2026-07-02")).toEqual([]);
  });

  it("groups by the US-Eastern date of the comment ts", async () => {
    await appendComment(comment({ symbol: "AMD.US", ts: "2026-07-02T02:00:00.000Z", text: "late" }));
    expect(await listComments("AMD.US", "2026-07-01")).toHaveLength(1);
    expect(await listComments("AMD.US", "2026-07-02")).toEqual([]);
  });

  it("round-trips optional fields and drops absent ones", async () => {
    await appendComment(
      comment({ symbol: "MRVL.US", trigger: "macd_cross: golden", escalated: true, chartId: "c1" }),
    );
    await appendComment(comment({ symbol: "MRVL.US", text: "bare" }));
    const [full, bare] = await listComments("MRVL.US", "2026-07-02");
    expect(full.trigger).toBe("macd_cross: golden");
    expect(full.escalated).toBe(true);
    expect(full.chartId).toBe("c1");
    expect("trigger" in bare).toBe(false);
    expect("escalated" in bare).toBe(false);
    expect("chartId" in bare).toBe(false);
  });

  it("lands every comment under concurrent appends for one symbol", async () => {
    const texts = Array.from({ length: 8 }, (_, i) => `c${i}`);
    await Promise.all(texts.map((text) => appendComment(comment({ symbol: "SMH.US", text }))));
    const list = await listComments("SMH.US", "2026-07-02");
    expect(list.map((c) => c.text).sort()).toEqual([...texts].sort());
  });

  it("returns the latest successful commentator time and ignores later system comments", async () => {
    await appendComment(comment({ symbol: "FRESH.US", ts: "2026-07-02T15:00:00.000Z" }));
    await appendComment(
      comment({ symbol: "FRESH.US", ts: "2026-07-02T15:05:00.000Z", source: "system", level: "error" }),
    );
    await appendComment(comment({ symbol: "FRESH.US", ts: "2026-07-02T15:10:00.000Z" }));

    expect(await latestCommentatorRunAt("FRESH.US", "2026-07-02")).toBe(
      Date.parse("2026-07-02T15:10:00.000Z"),
    );
    expect(await latestCommentatorRunAt("FRESH.US", "2026-07-03")).toBeNull();
  });
});

describe("comment event bus", () => {
  it("broadcasts to an application-wide listener without a symbol subscription", async () => {
    const received: CockpitComment[] = [];
    const unsub = onAnyComment((c) => received.push(c));
    await appendComment(comment({ symbol: "GLOBAL.US", text: "background alert", level: "alert" }));
    expect(received.map((c) => c.symbol)).toEqual(["GLOBAL.US"]);
    unsub();
  });

  it("broadcasts appended comments to the matching symbol", async () => {
    const received: CockpitComment[] = [];
    const unsub = onComment("BUS1.US", (c) => received.push(c));
    await appendComment(comment({ symbol: "BUS1.US", text: "live" }));
    expect(received.map((c) => c.text)).toEqual(["live"]);
    unsub();
    await appendComment(comment({ symbol: "BUS1.US", text: "after-unsub" }));
    expect(received).toHaveLength(1);
  });

  it("does not deliver comments for other symbols", async () => {
    const received: CockpitComment[] = [];
    const unsub = onComment("BUS2.US", (c) => received.push(c));
    await appendComment(comment({ symbol: "MU.US" }));
    expect(received).toHaveLength(0);
    unsub();
  });

  it("isolates a throwing listener from later listeners and the append", async () => {
    const received: CockpitComment[] = [];
    const unsubBad = onComment("BUS3.US", () => {
      throw new Error("boom");
    });
    const unsubGood = onComment("BUS3.US", (c) => received.push(c));
    await expect(appendComment(comment({ symbol: "BUS3.US", text: "survives" }))).resolves.toBeUndefined();
    expect(received.map((c) => c.text)).toEqual(["survives"]);
    unsubBad();
    unsubGood();
  });
});
