import { describe, expect, it } from "vitest";
import type { ChartDoc, ChartMeta, CockpitComment, RawBar } from "../../shared/types.js";
import type { RawPosition } from "../src/services/longbridge.js";
import {
  buildCommentPack,
  buildReassessPack,
  type DatapackDeps,
  findTodayLatestIntradayDoc,
  truncateForPrompt,
} from "../src/ai/datapack.js";

const NOW = new Date("2026-07-02T18:00:00Z");

function genBars(n: number, base = 100): RawBar[] {
  const start = Date.parse("2026-07-02T13:30:00Z");
  return Array.from({ length: n }, (_, i) => {
    const close = base + Math.sin(i / 3) * 2 + i * 0.05;
    return {
      time: new Date(start + i * 5 * 60_000).toISOString(),
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + i * 10,
    };
  });
}

function intradayDoc(id: string, createdAt: string): ChartDoc {
  return {
    id,
    schema_version: 2,
    type: "intraday",
    title: id,
    symbol: "MU.US",
    created_at: createdAt,
    updated_at: createdAt,
    input: { prediction: { direction: "long", anchor: { timeframe: "m15", time: "2026-07-02T14:00:00Z", price: 100 } } },
    built: {
      kind: "intraday",
      timeframes: {} as never,
      defaultTf: "m15",
      entryPlan: {
        entry: 100,
        stop: 96,
        target1: 106,
        target1_pct: 6,
        target2: 112,
        target2_pct: 12,
        rr: 1.5,
        rr_ok: false,
        rr_great: false,
        note: "",
        rationale: "",
        stop_note: "",
        entry_zone: null,
        target_contexts: [],
        price_zones: [],
      },
      sidebar: {} as never,
    },
  } as ChartDoc;
}

function comment(text: string): CockpitComment {
  return { ts: "2026-07-02T15:00:00.000Z", symbol: "MU.US", level: "info", text, source: "commentator" };
}

function makeDeps(overrides: Partial<DatapackDeps> = {}): DatapackDeps {
  const doc = intradayDoc("2026-07-02-mu", "2026-07-02T15:00:00Z");
  return {
    fetchQuote: async () => ({ symbol: "MU.US", session: "日盘", last: 101, pct: 1, regularLast: 101, regularPct: 1 }),
    fetchKline: async () => genBars(80),
    fetchFlow: async () => [{ time: "2026-07-02T13:30:00Z", inflow: "123.4" }],
    fetchPositions: async () => [],
    listComments: async () => Array.from({ length: 7 }, (_, i) => comment(`c${i}`)),
    listCharts: async () => [{ ...doc } as ChartMeta],
    loadChart: async () => doc,
    now: () => NOW,
    ...overrides,
  };
}

describe("findTodayLatestIntradayDoc", () => {
  it("picks today's latest doc, ignoring older dates", async () => {
    const older = intradayDoc("2026-07-01-mu", "2026-07-01T15:00:00Z");
    const earlyToday = intradayDoc("2026-07-02-a", "2026-07-02T14:00:00Z");
    const lateToday = intradayDoc("2026-07-02-b", "2026-07-02T17:00:00Z");
    const byId: Record<string, ChartDoc> = { [older.id]: older, [earlyToday.id]: earlyToday, [lateToday.id]: lateToday };
    const deps = makeDeps({
      listCharts: async () => [lateToday, earlyToday, older] as ChartMeta[],
      loadChart: async (id) => byId[id] ?? null,
    });
    const doc = await findTodayLatestIntradayDoc("MU.US", deps);
    expect(doc?.id).toBe("2026-07-02-b");
  });

  it("returns null when no doc falls on today", async () => {
    const older = intradayDoc("2026-07-01-mu", "2026-07-01T15:00:00Z");
    const deps = makeDeps({ listCharts: async () => [older] as ChartMeta[] });
    expect(await findTodayLatestIntradayDoc("MU.US", deps)).toBeNull();
  });
});

describe("buildCommentPack", () => {
  it("assembles quote, 48 m5 bars with MACD, flow, prediction summary, last 5 comments", async () => {
    const pack = await buildCommentPack("MU.US", makeDeps());
    expect(pack.symbol).toBe("MU.US");
    expect(pack.as_of).toBe(NOW.toISOString());
    expect(pack.quote.last).toBe(101);
    expect(pack.m5.bars).toHaveLength(48);
    expect(pack.m5.macd.dif).toHaveLength(48);
    expect(pack.m5.macd.hist).toHaveLength(48);
    expect(pack.flow).toHaveLength(1);
    expect(pack.prediction).toEqual({
      chartId: "2026-07-02-mu",
      direction: "long",
      anchor: { timeframe: "m15", time: "2026-07-02T14:00:00Z", price: 100 },
      stop: 96,
      target1: 106,
      target2: 112,
    });
    expect(pack.recent_comments.map((c) => c.text)).toEqual(["c2", "c3", "c4", "c5", "c6"]);
  });

  it("null prediction summary when no archived doc for today", async () => {
    const pack = await buildCommentPack("MU.US", makeDeps({ listCharts: async () => [] }));
    expect(pack.prediction).toBeNull();
  });

  it("stays JSON-serializable", async () => {
    const pack = await buildCommentPack("MU.US", makeDeps());
    expect(() => JSON.stringify(pack)).not.toThrow();
  });
});

describe("buildReassessPack", () => {
  it("assembles m5/m15/h1 bars + indicators, flow, full prediction, position", async () => {
    const positions: RawPosition[] = [
      { available: "10", cost_price: "90", currency: "USD", market: "US", name: "Micron", quantity: "10", symbol: "MU.US" },
    ];
    const pack = await buildReassessPack("MU.US", makeDeps({ fetchPositions: async () => positions }));
    expect(Object.keys(pack.timeframes)).toEqual(["m5", "m15", "h1"]);
    expect(pack.timeframes.m5.bars).toHaveLength(60);
    expect(pack.timeframes.m5.summary).not.toBeNull();
    expect(pack.timeframes.h1.summary?.last_hist).toBeTypeOf("number");
    expect(pack.prediction?.direction).toBe("long");
    expect(pack.prediction_chart_id).toBe("2026-07-02-mu");
    expect(pack.position?.symbol).toBe("MU.US");
    expect(pack.position?.shares).toBe(10);
  });

  it("position null when no matching holding, prediction still present", async () => {
    const pack = await buildReassessPack("MU.US", makeDeps());
    expect(pack.position).toBeNull();
    expect(pack.prediction?.direction).toBe("long");
  });

  it("summary null when a timeframe has too few bars", async () => {
    const deps = makeDeps({ fetchKline: async () => genBars(20) });
    const pack = await buildReassessPack("MU.US", deps);
    expect(pack.timeframes.m5.summary).toBeNull();
    expect(pack.timeframes.m5.bars).toHaveLength(20);
  });
});

describe("truncateForPrompt", () => {
  const pack = { a: "x".repeat(50) };
  const full = JSON.stringify(pack);

  it("returns full json below maxChars", () => {
    expect(truncateForPrompt(pack, full.length + 10)).toBe(full);
  });

  it("returns full json at exactly maxChars", () => {
    expect(truncateForPrompt(pack, full.length)).toBe(full);
  });

  it("hard-caps to maxChars above the limit", () => {
    const out = truncateForPrompt(pack, 10);
    expect(out).toHaveLength(10);
    expect(out).toBe(full.slice(0, 10));
  });
});
