import { describe, expect, it, vi } from "vitest";
import { Period, TradeSessions } from "longbridge";
import { CandlestickLedger, type CandleBar, type CandlestickPort } from "../src/services/marketdata/candlestickLedger.js";

function makePort(): CandlestickPort & { subscribeCandlesticks: ReturnType<typeof vi.fn>; unsubscribeCandlesticks: ReturnType<typeof vi.fn> } {
  return {
    subscribeCandlesticks: vi.fn().mockResolvedValue([]),
    unsubscribeCandlesticks: vi.fn().mockResolvedValue(undefined),
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function bar(overrides: Partial<CandleBar> = {}): CandleBar {
  return {
    symbol: "AAPL.US",
    period: "5m",
    ts: 0,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 100,
    turnover: 150,
    ...overrides,
  };
}

describe("CandlestickLedger", () => {
  it("subscribes to the SDK once for repeated subscribers, and unsubscribes only when the refcount hits zero", async () => {
    const port = makePort();
    const ledger = new CandlestickLedger(async () => port);

    const unsubA = ledger.subscribe("AAPL.US", "5m", () => {});
    const unsubB = ledger.subscribe("AAPL.US", "5m", () => {});
    await flush();

    expect(port.subscribeCandlesticks).toHaveBeenCalledTimes(1);
    expect(port.subscribeCandlesticks).toHaveBeenCalledWith("AAPL.US", Period.Min_5, TradeSessions.Intraday);

    unsubA();
    await flush();
    expect(port.unsubscribeCandlesticks).not.toHaveBeenCalled();

    unsubB();
    await flush();
    expect(port.unsubscribeCandlesticks).toHaveBeenCalledTimes(1);
    expect(port.unsubscribeCandlesticks).toHaveBeenCalledWith("AAPL.US", Period.Min_5);
  });

  it("is idempotent when the same unsubscribe function is called twice", async () => {
    const port = makePort();
    const ledger = new CandlestickLedger(async () => port);

    const unsub = ledger.subscribe("AAPL.US", "day", () => {});
    await flush();
    unsub();
    unsub();
    await flush();

    expect(port.unsubscribeCandlesticks).toHaveBeenCalledTimes(1);
  });

  it("keeps other callbacks alive when one callback throws", async () => {
    const port = makePort();
    const ledger = new CandlestickLedger(async () => port);
    const good1 = vi.fn();
    const good2 = vi.fn();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });

    ledger.subscribe("MRVL.US", "1m", good1);
    ledger.subscribe("MRVL.US", "1m", bad);
    ledger.subscribe("MRVL.US", "1m", good2);
    await flush();

    const payload = bar({ symbol: "MRVL.US", period: "1m" });
    expect(() => ledger.dispatch("MRVL.US", "1m", payload)).not.toThrow();

    expect(good1).toHaveBeenCalledWith(payload);
    expect(good2).toHaveBeenCalledWith(payload);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch to unrelated symbol/period keys", async () => {
    const port = makePort();
    const ledger = new CandlestickLedger(async () => port);
    const cb = vi.fn();
    ledger.subscribe("AAPL.US", "5m", cb);
    await flush();

    ledger.dispatch("AAPL.US", "15m", bar({ period: "15m" }));
    ledger.dispatch("MU.US", "5m", bar({ symbol: "MU.US" }));

    expect(cb).not.toHaveBeenCalled();
  });

  it("resubscribes every key with a nonzero refcount on reconnect, and skips released keys", async () => {
    const port = makePort();
    const ledger = new CandlestickLedger(async () => port);

    const unsubB = ledger.subscribe("SMH.US", "day", () => {});
    ledger.subscribe("AAPL.US", "60m", () => {});
    await flush();
    port.subscribeCandlesticks.mockClear();

    unsubB();
    await flush();
    port.subscribeCandlesticks.mockClear();

    await ledger.resubscribeAll();

    expect(port.subscribeCandlesticks).toHaveBeenCalledTimes(1);
    expect(port.subscribeCandlesticks).toHaveBeenCalledWith("AAPL.US", Period.Min_60, TradeSessions.Intraday);
  });
});
