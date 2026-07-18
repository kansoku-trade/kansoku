import { describe, expect, it } from "vitest";
import type { ChartDoc, ChartMeta, CockpitComment, IntradayEventRisk, RawBar } from "../../../shared/types.js";
import type { RawPosition } from "../src/services/marketdata/types.js";
import {
  buildCommentPack,
  buildCommentUpdate,
  buildReassessPack,
  type CommentPack,
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
    fetchNews: async () => [],
    fetchPositions: async () => [],
    listComments: async () => Array.from({ length: 7 }, (_, i) => comment(`c${i}`)),
    listCharts: async () => [{ ...doc } as ChartMeta],
    loadChart: async () => doc,
    fetchOptionsLevels: async () => null,
    fetchEventRisk: async () => null,
    readLessons: async () => [],
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

describe("buildCommentUpdate", () => {
  function updatePack(bars: RawBar[]): CommentPack {
    const idx = bars.map((_, i) => i);
    return {
      symbol: "MU.US",
      as_of: NOW.toISOString(),
      quote: { symbol: "MU.US", session: "日盘", last: 101, pct: 1, regularLast: 101, regularPct: 1 } as CommentPack["quote"],
      m5: { bars, macd: { dif: idx, dea: idx.map((i) => i * 2), hist: idx.map((i) => i * 3) } },
      flow: Array.from({ length: 25 }, (_, i) => ({ time: `t${i}`, inflow: String(i) })) as CommentPack["flow"],
      prediction: { chartId: "x", direction: "long", anchor: null, entry: 1, stop: 0, target1: 2, target2: 3, zones: [] },
      recent_comments: [comment("c0")],
      day_levels: {
        prev_day: { high: 2, low: 1, close: 1.5 } as never,
        pre_market: { high: 2.2, low: 1.1 } as never,
        opening_range: { high: 2.4, low: 1.2 } as never,
      },
      rel_volume: null,
    };
  }

  it("keeps all bars when lastBarTime is null", () => {
    const pack = updatePack(genBars(10));
    const update = buildCommentUpdate(pack, null);
    expect(update.m5.bars).toHaveLength(10);
    expect(update.m5.macd.dif).toHaveLength(10);
  });

  it("keeps only bars newer than lastBarTime, with aligned macd tails", () => {
    const bars = genBars(10);
    const pack = updatePack(bars);
    const update = buildCommentUpdate(pack, bars[6].time);
    expect(update.m5.bars.map((b) => b.time)).toEqual(bars.slice(7).map((b) => b.time));
    expect(update.m5.macd.dif).toEqual([7, 8, 9]);
    expect(update.m5.macd.dea).toEqual([14, 16, 18]);
    expect(update.m5.macd.hist).toEqual([21, 24, 27]);
  });

  it("returns empty bars and macd when nothing is newer than lastBarTime", () => {
    const bars = genBars(10);
    const update = buildCommentUpdate(updatePack(bars), bars[9].time);
    expect(update.m5.bars).toEqual([]);
    expect(update.m5.macd).toEqual({ dif: [], dea: [], hist: [] });
  });

  it("trims flow to the tail and drops fields already in the session transcript", () => {
    const update = buildCommentUpdate(updatePack(genBars(5)), null);
    expect(update.flow).toHaveLength(10);
    expect(update.flow[0].inflow).toBe("15");
    expect(update.day_levels).toEqual({ opening_range: { high: 2.4, low: 1.2 } });
    expect(update).not.toHaveProperty("prediction");
    expect(update).not.toHaveProperty("recent_comments");
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
      entry: 100,
      stop: 96,
      target1: 106,
      target2: 112,
      zones: [],
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

  it("extracts non-plan zones from the entry plan into the prediction summary", async () => {
    const doc = intradayDoc("2026-07-02-mu", "2026-07-02T15:00:00Z");
    const built = doc.built as Extract<ChartDoc["built"], { kind: "intraday" }>;
    built.entryPlan!.price_zones = [
      { kind: "resistance", label: "上方阻力", low: 108, high: 110 },
      { kind: "entry", label: "入场区", low: 99, high: 101 },
    ];
    const pack = await buildCommentPack("MU.US", makeDeps({ loadChart: async () => doc }));
    expect(pack.prediction?.zones).toEqual([{ label: "上方阻力", low: 108, high: 110 }]);
  });

  it("computes day levels and relative volume from period-aware klines", async () => {
    const m5 = [
      ...genBars(4).map((b, i) => ({ ...b, time: new Date(Date.parse("2026-07-02T12:00:00Z") + i * 5 * 60_000).toISOString() })),
      ...genBars(10),
    ];
    const dayBars: RawBar[] = [
      { time: "2026-07-01T04:00:00Z", open: 98, high: 104, low: 97, close: 103, volume: 100000 },
      { time: "2026-07-02T04:00:00Z", open: 103, high: 106, low: 101, close: 105, volume: 100000 },
    ];
    const m15: RawBar[] = [
      { time: "2026-07-01T13:30:00Z", open: 100, high: 101, low: 99, close: 100, volume: 500 },
      { time: "2026-07-02T13:30:00Z", open: 100, high: 101, low: 99, close: 100, volume: 1500 },
    ];
    const deps = makeDeps({
      fetchKline: async (_sym, period) => {
        if (period === "day") return dayBars;
        if (period === "15m") return m15;
        return m5;
      },
    });
    const pack = await buildCommentPack("MU.US", deps);
    expect(pack.day_levels.prev_day).toEqual({ high: 104, low: 97, close: 103 });
    expect(pack.day_levels.pre_market).not.toBeNull();
    expect(pack.day_levels.opening_range).not.toBeNull();
    expect(pack.rel_volume?.ratio).toBe(3);
    expect(pack.rel_volume?.days_used).toBe(1);
  });

  it("degrades day levels and relative volume to null when auxiliary fetches fail", async () => {
    const deps = makeDeps({
      fetchKline: async (_sym, period) => {
        if (period === "day" || period === "15m") throw new Error("boom");
        return genBars(80);
      },
    });
    const pack = await buildCommentPack("MU.US", deps);
    expect(pack.day_levels.prev_day).toBeNull();
    expect(pack.rel_volume).toBeNull();
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

  it("includes market context, day levels, news and rel_volume", async () => {
    const pack = await buildReassessPack(
      "MU.US",
      makeDeps({ fetchNews: async () => [{ id: "1", title: "t", published_at: "", url: "" }] }),
    );
    expect(pack.market.spy).not.toBeNull();
    expect(pack.market.qqq).not.toBeNull();
    expect(pack.day_levels?.prev_day).toBeDefined();
    expect(pack.news).toHaveLength(1);
    expect(pack).toHaveProperty("rel_volume");
  });

  it("degrades market/news to null/empty when the extra fetches fail", async () => {
    const pack = await buildReassessPack(
      "MU.US",
      makeDeps({
        fetchQuote: async () => {
          throw new Error("quote down");
        },
        fetchNews: async () => {
          throw new Error("news down");
        },
      }),
    );
    expect(pack.market.spy).toBeNull();
    expect(pack.market.qqq).toBeNull();
    expect(pack.news).toEqual([]);
  });

  it("summary null when a timeframe has too few bars", async () => {
    const deps = makeDeps({ fetchKline: async () => genBars(20) });
    const pack = await buildReassessPack("MU.US", deps);
    expect(pack.timeframes.m5.summary).toBeNull();
    expect(pack.timeframes.m5.bars).toHaveLength(20);
  });

  it("surfaces the stubbed event_risk value", async () => {
    const eventRisk: IntradayEventRisk = {
      next_earnings: { date: "2026-07-10", title: "Q3 earnings" },
      macro: [{ ts: "2026-07-09T12:30:00Z", title: "CPI", estimate: "3.1%", previous: "3.0%" }],
      updated_at: NOW.toISOString(),
    };
    const pack = await buildReassessPack("MU.US", makeDeps({ fetchEventRisk: async () => eventRisk }));
    expect(pack.event_risk).toEqual(eventRisk);
  });

  it("event_risk null when fetchEventRisk rejects", async () => {
    const pack = await buildReassessPack(
      "MU.US",
      makeDeps({
        fetchEventRisk: async () => {
          throw new Error("calendar down");
        },
      }),
    );
    expect(pack.event_risk).toBeNull();
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
