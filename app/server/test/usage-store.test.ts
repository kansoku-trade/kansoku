import { promises as fs } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? "/tmp/";
  const sep = base.endsWith("/") ? "" : "/";
  const dir = `${base}${sep}usage-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock("../src/env.js", () => ({ CHART_DATA_DIR: ctx.dir }));

const { appendUsage, listUsage, summarizeUsage } = await import("../src/ai/usageStore.js");
type UsageRecord = Awaited<ReturnType<typeof listUsage>>[number];

function record(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    ts: "2026-07-02T15:00:00.000Z",
    layer: "commentator",
    symbol: "MU.US",
    model: "anthropic/haiku",
    calls: 1,
    total_tokens: 1000,
    input: 800,
    output: 200,
    cache_read: 0,
    cache_write: 0,
    cost_total: 0.01,
    ...overrides,
  };
}

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

describe("usage store", () => {
  it("round-trips records grouped by eastern date", async () => {
    await appendUsage(record());
    await appendUsage(record({ layer: "analyst", total_tokens: 5000, cost_total: 0.2 }));
    const records = await listUsage("2026-07-02");
    expect(records).toHaveLength(2);
    expect(records[0].layer).toBe("commentator");
  });

  it("returns empty for a date without records", async () => {
    expect(await listUsage("2020-01-01")).toEqual([]);
  });

  it("survives concurrent appends", async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => appendUsage(record({ ts: `2026-07-03T15:00:0${i}.000Z` }))),
    );
    expect(await listUsage("2026-07-03")).toHaveLength(5);
  });
});

describe("summarizeUsage", () => {
  it("aggregates totals and per-layer breakdown", () => {
    const summary = summarizeUsage("2026-07-02", [
      record(),
      record({ layer: "analyst", calls: 4, total_tokens: 5000, cost_total: 0.2 }),
      record({ total_tokens: 2000, cost_total: 0.02 }),
    ]);
    expect(summary.runs).toBe(3);
    expect(summary.calls).toBe(6);
    expect(summary.total_tokens).toBe(8000);
    expect(summary.cost_total).toBeCloseTo(0.23);
    expect(summary.by_layer.commentator).toEqual({ runs: 2, total_tokens: 3000, cost_total: 0.03 });
    expect(summary.by_layer.analyst.runs).toBe(1);
  });

  it("handles no records", () => {
    const summary = summarizeUsage("2026-07-02", []);
    expect(summary.runs).toBe(0);
    expect(summary.cost_total).toBe(0);
  });
});
