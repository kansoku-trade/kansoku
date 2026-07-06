import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteCell, RawBar } from "../../shared/types.js";

const provider = vi.hoisted(() => ({
  name: "mock",
  capabilities: new Set<string>(),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn(),
}));

const stream = vi.hoisted(() => {
  const listeners = new Set<(cell: QuoteCell) => void>();
  return {
    listeners,
    retain: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn((cb: (cell: QuoteCell) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    getSnapshot: vi.fn(() => undefined),
    push(cell: QuoteCell) {
      for (const l of listeners) l(cell);
    },
  };
});

vi.mock("../src/services/marketdata/registry.js", () => ({ getProvider: () => provider }));
vi.mock("../src/services/marketdata/longbridgeStream.js", () => ({ getLongbridgeStream: () => stream }));

const { subscribeBenchmark } = await import("../src/realtime/benchmark.js");

const REGULAR_TS = "2026-07-02T15:00:00.000Z";

function bars(close: number): RawBar[] {
  return [{ time: REGULAR_TS, open: close, high: close, low: close, close, volume: 100 }];
}

function cell(symbol: string): QuoteCell {
  return { symbol, session: "日盘", last: 1, pct: 0, regularLast: 1, regularPct: 0 };
}

describe("subscribeBenchmark", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(REGULAR_TS));
    stream.listeners.clear();
    stream.retain.mockClear();
    stream.release.mockClear();
    provider.getKline.mockReset().mockImplementation((symbol: string) => Promise.resolve(bars(symbol === "MU.US" ? 100 : 10)));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers an init snapshot covering the symbol plus SMH/QQQ, and retains all three", async () => {
    const events: unknown[] = [];
    const unsub = subscribeBenchmark("MU.US", (env) => events.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);

    expect(stream.retain).toHaveBeenCalledWith(["MU.US", "SMH.US", "QQQ.US"]);
    const data = events.find((e: any) => e.type === "data") as any;
    expect(data.data.map((s: any) => s.symbol)).toEqual(["MU.US", "SMH.US", "QQQ.US"]);
    unsub();
  });

  it("throttles quote-driven refreshes to at least 5s apart", async () => {
    const unsub = subscribeBenchmark("MU.US", () => {});
    await vi.advanceTimersByTimeAsync(0);
    provider.getKline.mockClear();

    stream.push(cell("SMH.US"));
    stream.push(cell("QQQ.US"));
    await vi.advanceTimersByTimeAsync(4_000);
    expect(provider.getKline).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(provider.getKline).toHaveBeenCalledTimes(3);
    unsub();
  });

  it("ignores quote pushes for unrelated symbols", async () => {
    const unsub = subscribeBenchmark("MU.US", () => {});
    await vi.advanceTimersByTimeAsync(0);
    provider.getKline.mockClear();

    stream.push(cell("NVDA.US"));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(provider.getKline).not.toHaveBeenCalled();
    unsub();
  });

  it("stops refreshing after unsubscribe and releases the symbols", async () => {
    const unsub = subscribeBenchmark("MU.US", () => {});
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    expect(stream.release).toHaveBeenCalledWith(["MU.US", "SMH.US", "QQQ.US"]);

    provider.getKline.mockClear();
    stream.push(cell("SMH.US"));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(provider.getKline).not.toHaveBeenCalled();
  });
});
