import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartDoc } from "@kansoku/shared/types";
import { easternDate } from "../src/services/session.js";

const TODAY = easternDate();

const store = vi.hoisted(() => ({ loadChart: vi.fn() }));
const build = vi.hoisted(() => ({
  buildChart: vi.fn(),
  refreshBody: vi.fn(),
  rebuild: vi.fn(),
}));
const longbridgeStream = vi.hoisted(() => ({
  subscribeCandlesticks: vi.fn(),
}));

vi.mock("../src/services/store.js", () => store);
vi.mock("../src/services/build.js", () => build);
vi.mock("../src/services/marketdata/longbridgeStream.js", () => ({
  getLongbridgeStream: () => longbridgeStream,
}));
vi.mock("../src/services/optionsLevels.js", () => ({ getOptionsLevels: vi.fn().mockResolvedValue(null) }));
vi.mock("../src/services/events.js", () => ({ getEventRisk: vi.fn().mockResolvedValue(null) }));

const { subscribeChart, subscribePreview } = await import("../src/realtime/charts.js");

type CandleCb = (bar: { ts: number; open: number; high: number; low: number; close: number; volume: number; symbol: string; period: string }) => void;

function makeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id: `${TODAY}-nvda-intraday`,
    schema_version: 1,
    type: "intraday",
    title: "NVDA 短线多周期",
    symbol: "NVDA.US",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    input: {
      symbol: "NVDA.US",
      timeframes: {
        m5: [{ time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
        m15: [{ time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
        h1: [{ time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      },
    },
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
    ...overrides,
  };
}

describe("subscribeChart candlestick-push wiring", () => {
  const callbacksByPeriod = new Map<string, CandleCb>();
  const unsubSpies = new Map<string, ReturnType<typeof vi.fn>>();

  beforeEach(() => {
    vi.useFakeTimers();
    callbacksByPeriod.clear();
    unsubSpies.clear();
    store.loadChart.mockReset().mockResolvedValue(makeDoc());
    build.refreshBody.mockReset().mockReturnValue({ type: "intraday", symbol: "NVDA.US" });
    build.rebuild.mockReset().mockReturnValue({
      type: "intraday",
      title: "NVDA 短线多周期",
      symbol: "NVDA.US",
      input: {},
      built: { kind: "intraday", pushed: true },
      meta: {},
    });
    build.buildChart.mockReset();
    longbridgeStream.subscribeCandlesticks.mockReset();
    longbridgeStream.subscribeCandlesticks.mockImplementation((_symbol: string, period: string, cb: CandleCb) => {
      callbacksByPeriod.set(period, cb);
      const unsub = vi.fn();
      unsubSpies.set(period, unsub);
      return unsub;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges a same-bucket push into the last bar and schedules exactly one debounced rebuild for a burst", async () => {
    const events: string[] = [];
    const unsub = await subscribeChart(`${TODAY}-nvda-intraday`, (e) => events.push(e));

    const m5cb = callbacksByPeriod.get("5m");
    expect(m5cb).toBeTruthy();

    m5cb!({ symbol: "NVDA.US", period: "5m", ts: 1_000, open: 1, high: 2, low: 1, close: 1.5, volume: 10 });
    m5cb!({ symbol: "NVDA.US", period: "5m", ts: 1_000, open: 1, high: 2.5, low: 1, close: 1.8, volume: 20 });
    m5cb!({ symbol: "NVDA.US", period: "5m", ts: 1_000, open: 1, high: 3, low: 1, close: 2, volume: 30 });

    expect(build.rebuild).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);

    expect(build.rebuild).toHaveBeenCalledTimes(1);
    const [, input] = build.rebuild.mock.calls[0];
    expect(input.timeframes.m5).toHaveLength(1);
    expect(input.timeframes.m5[0].close).toBe(2);

    const dataEvents = events.map((e) => JSON.parse(e)).filter((e) => e.type === "data");
    expect(dataEvents.some((e) => e.data.built.pushed)).toBe(true);
    unsub();
  });

  it("appends a new bar when a push opens a later bucket", async () => {
    store.loadChart.mockResolvedValue(makeDoc({ id: `${TODAY}-nvda-intraday-2` }));
    const unsub = await subscribeChart(`${TODAY}-nvda-intraday-2`, () => {});
    const m5cb = callbacksByPeriod.get("5m")!;

    m5cb({ symbol: "NVDA.US", period: "5m", ts: 2_000, open: 2, high: 2, low: 2, close: 2, volume: 5 });
    await vi.advanceTimersByTimeAsync(1_500);

    const [, input] = build.rebuild.mock.calls[0];
    expect(input.timeframes.m5).toHaveLength(2);
    expect(input.timeframes.m5[1].time).toBe(new Date(2_000).toISOString());
    unsub();
  });

  it("releases all per-timeframe ledger subscriptions when the last subscriber leaves", async () => {
    store.loadChart.mockResolvedValue(makeDoc({ id: `${TODAY}-nvda-intraday-3` }));
    const unsub = await subscribeChart(`${TODAY}-nvda-intraday-3`, () => {});
    expect(longbridgeStream.subscribeCandlesticks).toHaveBeenCalledTimes(3);

    unsub();

    for (const period of ["5m", "15m", "60m"]) {
      expect(unsubSpies.get(period)).toHaveBeenCalledTimes(1);
    }
  });

  it("does not wire candlestick subscriptions for non-intraday live types", async () => {
    store.loadChart.mockResolvedValue(makeDoc({ id: `${TODAY}-flow`, type: "flow" }));
    build.refreshBody.mockReturnValue({ type: "flow", symbol: "NVDA.US" });

    await subscribeChart(`${TODAY}-flow`, () => {});
    expect(longbridgeStream.subscribeCandlesticks).not.toHaveBeenCalled();
  });

  it("writes the poller's freshly fetched bars into candle state so a later push has no hole", async () => {
    store.loadChart.mockResolvedValue(makeDoc({ id: `${TODAY}-nvda-intraday-fresh` }));
    build.buildChart.mockResolvedValue({
      input: {
        timeframes: {
          m5: [{ time: new Date(5_000).toISOString(), open: 5, high: 5, low: 5, close: 5, volume: 5 }],
          m15: [],
          h1: [],
        },
      },
      built: { kind: "intraday", polled: true },
    });

    const unsub = await subscribeChart(`${TODAY}-nvda-intraday-fresh`, () => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    const m5cb = callbacksByPeriod.get("5m")!;
    m5cb({ symbol: "NVDA.US", period: "5m", ts: 6_000, open: 6, high: 6, low: 6, close: 6, volume: 1 });
    await vi.advanceTimersByTimeAsync(1_500);

    const [, input] = build.rebuild.mock.calls[0];
    expect(input.timeframes.m5).toHaveLength(3);
    expect(input.timeframes.m5[0].time).toBe(new Date(1_000).toISOString());
    expect(input.timeframes.m5[0].close).toBe(1);
    expect(input.timeframes.m5[1].time).toBe(new Date(5_000).toISOString());
    expect(input.timeframes.m5[1].close).toBe(5);
    expect(input.timeframes.m5[2].time).toBe(new Date(6_000).toISOString());
    expect(input.timeframes.m5[2].close).toBe(6);
    unsub();
  });

  it("backfills a gap when a live push arrives before the poller's full series", async () => {
    store.loadChart.mockResolvedValue(
      makeDoc({
        id: `${TODAY}-nvda-intraday-push-first`,
        input: {
          symbol: "NVDA.US",
          timeframes: {
            m5: [
              { time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
              { time: new Date(2_000).toISOString(), open: 2, high: 2, low: 2, close: 2, volume: 1 },
            ],
            m15: [],
            h1: [],
          },
        },
      }),
    );
    let finishPoll: (value: unknown) => void = () => {};
    build.buildChart.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPoll = resolve;
        }),
    );

    const unsub = await subscribeChart(`${TODAY}-nvda-intraday-push-first`, () => {});
    const m5cb = callbacksByPeriod.get("5m")!;
    m5cb({ symbol: "NVDA.US", period: "5m", ts: 4_000, open: 4, high: 4, low: 4, close: 4, volume: 1 });

    finishPoll({
      input: {
        timeframes: {
          m5: [
            { time: new Date(1_000).toISOString(), open: 10, high: 10, low: 10, close: 10, volume: 10 },
            { time: new Date(2_000).toISOString(), open: 20, high: 20, low: 20, close: 20, volume: 20 },
            { time: new Date(3_000).toISOString(), open: 3, high: 3, low: 3, close: 3, volume: 3 },
            { time: new Date(4_000).toISOString(), open: 4, high: 4, low: 4, close: 4, volume: 4 },
          ],
          m15: [],
          h1: [],
        },
      },
      built: { kind: "intraday", polled: true },
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    const mergedInputs = build.rebuild.mock.calls.map(([, input]) => input.timeframes.m5);
    expect(mergedInputs).toContainEqual([
      { time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: new Date(2_000).toISOString(), open: 20, high: 20, low: 20, close: 20, volume: 20 },
      { time: new Date(3_000).toISOString(), open: 3, high: 3, low: 3, close: 3, volume: 3 },
      { time: new Date(4_000).toISOString(), open: 4, high: 4, low: 4, close: 4, volume: 4 },
    ]);
    unsub();
  });

  it("respects the requested view count instead of the persisted full-length series on rebuild", async () => {
    store.loadChart.mockResolvedValue(
      makeDoc({
        id: `${TODAY}-nvda-intraday-count`,
        input: {
          symbol: "NVDA.US",
          timeframes: {
            m5: [
              { time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
              { time: new Date(2_000).toISOString(), open: 2, high: 2, low: 2, close: 2, volume: 1 },
              { time: new Date(3_000).toISOString(), open: 3, high: 3, low: 3, close: 3, volume: 1 },
            ],
            m15: [],
            h1: [],
          },
        },
      }),
    );
    build.buildChart.mockResolvedValue({
      input: {
        timeframes: {
          m5: [{ time: new Date(3_000).toISOString(), open: 3.5, high: 3.5, low: 3.5, close: 3.5, volume: 1 }],
          m15: [],
          h1: [],
        },
      },
      built: { kind: "intraday", polled: true },
    });

    const unsub = await subscribeChart(`${TODAY}-nvda-intraday-count`, () => {}, 1);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(build.buildChart).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));

    const m5cb = callbacksByPeriod.get("5m")!;
    m5cb({ symbol: "NVDA.US", period: "5m", ts: 4_000, open: 4, high: 4, low: 4, close: 4, volume: 1 });
    await vi.advanceTimersByTimeAsync(1_500);

    const [, input] = build.rebuild.mock.calls[0];
    expect(input.timeframes.m5).toHaveLength(4);
    expect(input.timeframes.m5[0].time).toBe(new Date(1_000).toISOString());
    expect(input.timeframes.m5[0].close).toBe(1);
    expect(input.timeframes.m5[1].time).toBe(new Date(2_000).toISOString());
    expect(input.timeframes.m5[1].close).toBe(2);
    expect(input.timeframes.m5[2].time).toBe(new Date(3_000).toISOString());
    expect(input.timeframes.m5[2].close).toBe(3.5);
    expect(input.timeframes.m5[3].time).toBe(new Date(4_000).toISOString());
    expect(input.timeframes.m5[3].close).toBe(4);
    unsub();
  });
});

describe("subscribePreview", () => {
  const callbacksByPeriod = new Map<string, CandleCb>();
  const unsubSpies = new Map<string, ReturnType<typeof vi.fn>>();

  function previewBuildResult(symbol: string) {
    return {
      type: "intraday",
      title: `${symbol} 短线多周期`,
      slug: "preview-intraday",
      symbol,
      sessionDate: "2026-07-13",
      input: {
        symbol,
        timeframes: {
          m5: [{ time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
          m15: [],
          h1: [],
        },
      },
      built: { kind: "intraday" },
      meta: {},
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    callbacksByPeriod.clear();
    unsubSpies.clear();
    build.buildChart.mockReset().mockImplementation(async (body: { symbol: string }) => previewBuildResult(body.symbol));
    build.refreshBody.mockReset().mockImplementation((_type: string, input: { symbol: string }) => ({ type: "intraday", symbol: input.symbol }));
    build.rebuild.mockReset().mockImplementation((_type: string, input: { timeframes?: { m5?: unknown[] } }) => ({
      type: "intraday",
      title: "预览",
      symbol: "PREVIEW.US",
      input: {},
      built: { kind: "intraday", pushed: true, m5Len: input.timeframes?.m5?.length ?? 0 },
      meta: {},
    }));
    longbridgeStream.subscribeCandlesticks.mockReset();
    longbridgeStream.subscribeCandlesticks.mockImplementation((_symbol: string, period: string, cb: CandleCb) => {
      callbacksByPeriod.set(period, cb);
      const unsub = vi.fn();
      unsubSpies.set(period, unsub);
      return unsub;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds via the provider and pushes an initial data envelope with no prediction fields", async () => {
    const events: string[] = [];
    const unsub = await subscribePreview("PQQ1.US", (e) => events.push(e));

    expect(build.buildChart).toHaveBeenCalledWith(expect.objectContaining({ type: "intraday", symbol: "PQQ1.US" }));
    const parsed = JSON.parse(events[0]);
    expect(parsed.type).toBe("data");
    expect(parsed.data.built.kind).toBe("intraday");
    expect(parsed.data).not.toHaveProperty("prediction_stale");
    unsub();
  });

  it("triggers a debounced rebuild push on a pushed candlestick bar", async () => {
    const events: string[] = [];
    const unsub = await subscribePreview("PQQ2.US", (e) => events.push(e));
    // Subscribing kicks off the poller's own immediate safety-net tick (fire-and-forget);
    // flush it out here so the assertions below only see the push-triggered rebuild.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    build.rebuild.mockClear();
    events.length = 0;

    const m5cb = callbacksByPeriod.get("5m")!;
    m5cb({ symbol: "PQQ2.US", period: "5m", ts: 2_000, open: 2, high: 2, low: 2, close: 2, volume: 5 });
    await vi.advanceTimersByTimeAsync(1_500);

    expect(build.rebuild).toHaveBeenCalledTimes(1);
    const dataEvents = events.map((e) => JSON.parse(e)).filter((e) => e.type === "data");
    expect(dataEvents.some((e) => e.data.built.pushed)).toBe(true);
    unsub();
  });

  it("shares one build across two subscribers to the same symbol and pushes an initial envelope to each", async () => {
    const events1: string[] = [];
    const events2: string[] = [];
    const unsub1 = await subscribePreview("PQQ3.US", (e) => events1.push(e));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    build.buildChart.mockClear();

    const unsub2 = await subscribePreview("PQQ3.US", (e) => events2.push(e));

    expect(build.buildChart).not.toHaveBeenCalled();
    expect(JSON.parse(events1[0]).data.built.kind).toBe("intraday");
    expect(JSON.parse(events2[0]).data.built.kind).toBe("intraday");
    unsub1();
    unsub2();
  });

  it("gives a late joiner the current rebuilt data once, not a stale duplicate of the initial preview snapshot", async () => {
    const events1: string[] = [];
    const events2: string[] = [];
    const unsub1 = await subscribePreview("PQQ5.US", (e) => events1.push(e));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    build.rebuild.mockClear();
    const unsub2 = await subscribePreview("PQQ5.US", (e) => events2.push(e));

    expect(build.rebuild).not.toHaveBeenCalled();
    expect(events2).toHaveLength(1);
    const parsed = JSON.parse(events2[0]);
    expect(parsed.type).toBe("data");
    expect(parsed.data.built.pushed).toBe(true);
    unsub1();
    unsub2();
  });

  it("tears down state once both subscribers leave and rebuilds from scratch on a fresh subscribe", async () => {
    const unsub1 = await subscribePreview("PQQ4.US", () => {});
    const unsub2 = await subscribePreview("PQQ4.US", () => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(longbridgeStream.subscribeCandlesticks).toHaveBeenCalledTimes(3);

    unsub1();
    unsub2();

    for (const period of ["5m", "15m", "60m"]) {
      expect(unsubSpies.get(period)).toHaveBeenCalledTimes(1);
    }

    build.buildChart.mockClear();
    const unsub3 = await subscribePreview("PQQ4.US", () => {});
    expect(build.buildChart).toHaveBeenCalledWith(expect.objectContaining({ type: "intraday", symbol: "PQQ4.US" }));
    expect(longbridgeStream.subscribeCandlesticks).toHaveBeenCalledTimes(6);
    unsub3();
  });
});
