import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartDoc, ChartMeta, QuoteCell } from "../../../shared/types.js";

const provider = vi.hoisted(() => ({
  name: "mock",
  capabilities: new Set<string>(),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn(),
}));

const store = vi.hoisted(() => ({
  listCharts: vi.fn(),
  loadChart: vi.fn(),
}));

const comments = vi.hoisted(() => ({
  listComments: vi.fn(),
}));

const follows = vi.hoisted(() => ({
  listFollowedSymbols: vi.fn(),
}));

const stream = vi.hoisted(() => {
  const listeners = new Set<(cell: QuoteCell) => void>();
  return {
    listeners,
    onUpdate: vi.fn((cb: (cell: QuoteCell) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    push(cell: QuoteCell) {
      for (const l of listeners) l(cell);
    },
  };
});

vi.mock("../src/services/marketdata/registry.js", () => ({ getProvider: () => provider, getStream: () => stream }));
vi.mock("../src/services/store.js", () => store);
vi.mock("../src/ai/comments.js", () => comments);
vi.mock("../src/ai/follows.js", () => follows);

const { subscribeBoard } = await import("../src/realtime/board.js");
const { easternDate } = await import("../src/services/session.js");

function meta(): ChartMeta {
  return {
    id: `${easternDate()}-mu-intraday`,
    schema_version: 2,
    type: "intraday",
    title: "MU 短线多周期",
    symbol: "MU.US",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function doc(): ChartDoc {
  return {
    ...meta(),
    input: { symbol: "MU.US", prediction: { direction: "long" } },
    built: { kind: "intraday", entryPlan: { stop: 90, target1: 120 } } as unknown as ChartDoc["built"],
  };
}

function cell(symbol: string): QuoteCell {
  return { symbol, session: "日盘", last: 110, pct: 1.8, regularLast: 110, regularPct: 1.8 };
}

describe("subscribeBoard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stream.listeners.clear();
    store.listCharts.mockReset().mockResolvedValue([meta()]);
    store.loadChart.mockReset().mockResolvedValue(doc());
    comments.listComments.mockReset().mockResolvedValue([]);
    follows.listFollowedSymbols.mockReset().mockReturnValue(["MU.US"]);
    provider.getQuotes.mockReset().mockResolvedValue([
      { symbol: "MU.US", last: "110", prev_close: "108", change_percentage: "1.8" },
    ]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers an init snapshot with today's board rows", async () => {
    const events: unknown[] = [];
    const unsub = subscribeBoard((env) => events.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);

    const data = events.find((e: any) => e.type === "data") as any;
    expect(data.data.rows).toHaveLength(1);
    expect(data.data.rows[0].symbol).toBe("MU.US");
    expect(data.data.rows[0].ai_following).toBe(true);
    unsub();
  });

  it("marks a board row as stopped when its symbol is not persisted for AI follow-up", async () => {
    follows.listFollowedSymbols.mockReturnValue([]);
    const events: unknown[] = [];
    const unsub = subscribeBoard((env) => events.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);

    const data = events.find((e: any) => e.type === "data") as any;
    expect(data.data.rows[0].ai_following).toBe(false);
    unsub();
  });

  it("throttles quote-driven rebuilds to at least 2s and batches them", async () => {
    const unsub = subscribeBoard(() => {});
    await vi.advanceTimersByTimeAsync(0);
    provider.getQuotes.mockClear();

    stream.push(cell("MU.US"));
    stream.push(cell("MU.US"));
    stream.push(cell("NVDA.US"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(provider.getQuotes).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(provider.getQuotes).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("replays the last board to a second subscriber without refetching", async () => {
    const unsub = subscribeBoard(() => {});
    await vi.advanceTimersByTimeAsync(0);
    provider.getQuotes.mockClear();

    const events: unknown[] = [];
    const unsub2 = subscribeBoard((env) => events.push(JSON.parse(env)));
    expect(provider.getQuotes).not.toHaveBeenCalled();
    expect(events.some((e: any) => e.type === "data")).toBe(true);
    unsub();
    unsub2();
  });

  it("stops rebuilding after the last unsubscribe", async () => {
    const unsub = subscribeBoard(() => {});
    await vi.advanceTimersByTimeAsync(0);
    unsub();

    provider.getQuotes.mockClear();
    stream.push(cell("MU.US"));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(provider.getQuotes).not.toHaveBeenCalled();
  });

  it("triggers a fresh refresh for the next subscriber even if the torn-down refresh resolves late", async () => {
    const unsub = subscribeBoard(() => {});
    unsub();
    await vi.advanceTimersByTimeAsync(0);

    provider.getQuotes.mockClear();
    const events: unknown[] = [];
    const unsub2 = subscribeBoard((env) => events.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);

    expect(provider.getQuotes).toHaveBeenCalled();
    expect(events.some((e: any) => e.type === "data")).toBe(true);
    unsub2();
  });

  it("falls back to a slow periodic refresh so a board-only client isn't stuck between quote updates", async () => {
    const unsub = subscribeBoard(() => {});
    await vi.advanceTimersByTimeAsync(0);
    provider.getQuotes.mockClear();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(provider.getQuotes).toHaveBeenCalled();
    unsub();
  });
});
