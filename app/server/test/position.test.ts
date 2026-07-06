import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteCell } from "../../shared/types.js";

const provider = vi.hoisted(() => ({
  name: "mock",
  capabilities: new Set<string>(),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn(),
  getPositions: vi.fn(),
}));

const stream = vi.hoisted(() => {
  const snapshots = new Map<string, QuoteCell>();
  const listeners = new Set<(cell: QuoteCell) => void>();
  return {
    snapshots,
    listeners,
    retain: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn((cb: (cell: QuoteCell) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    getSnapshot: vi.fn((symbol: string) => snapshots.get(symbol)),
    push(cell: QuoteCell) {
      snapshots.set(cell.symbol, cell);
      for (const l of listeners) l(cell);
    },
  };
});

const entryPlan = vi.hoisted(() => ({
  latestIntradayDoc: vi.fn().mockResolvedValue(null),
  entryPlanFromDoc: vi.fn(() => null),
}));

vi.mock("../src/services/marketdata/registry.js", () => ({ getProvider: () => provider }));
vi.mock("../src/services/marketdata/longbridgeStream.js", () => ({ getLongbridgeStream: () => stream }));
vi.mock("../src/services/cockpit/entryPlan.js", () => entryPlan);

const { subscribePosition, buildPositionPayload } = await import("../src/realtime/position.js");

function cell(symbol: string, last: number): QuoteCell {
  return { symbol, session: "日盘", last, pct: 0, regularLast: last, regularPct: 0 };
}

describe("buildPositionPayload (pure P&L math)", () => {
  it("computes unrealized P&L from a cached position and a live quote", () => {
    const positions = [{ symbol: "MU.US", quantity: "10", cost_price: "100", currency: "USD", market: "US", name: "Micron", available: "10" }];
    const payload = buildPositionPayload(positions, "MU.US", 120, null, null);
    expect(payload.position).not.toBeNull();
    expect(payload.position!.unrealized).toBeCloseTo(200);
    expect(payload.position!.unrealizedPct).toBeCloseTo(20);
  });

  it("returns a null position when the symbol isn't held", () => {
    const payload = buildPositionPayload([], "MU.US", 120, null, { ratio: 1, today_cum: 1, baseline_avg: 1, days_used: 1, cutoff_minute: 1 });
    expect(payload.position).toBeNull();
    expect(payload.relvol).not.toBeNull();
  });
});

describe("subscribePosition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stream.snapshots.clear();
    stream.listeners.clear();
    stream.retain.mockClear();
    stream.release.mockClear();
    provider.getPositions.mockReset().mockResolvedValue([
      { symbol: "MU.US", quantity: "10", cost_price: "100", currency: "USD", market: "US", name: "Micron", available: "10" },
    ]);
    provider.getKline.mockReset().mockResolvedValue([]);
    entryPlan.latestIntradayDoc.mockReset().mockResolvedValue(null);
    entryPlan.entryPlanFromDoc.mockReset().mockReturnValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers an init snapshot and retains the symbol", async () => {
    stream.push(cell("MU.US", 110));
    const events: unknown[] = [];
    const unsub = subscribePosition("MU.US", (env) => events.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);

    expect(stream.retain).toHaveBeenCalledWith(["MU.US"]);
    const data = events.find((e: any) => e.type === "data") as any;
    expect(data.data.position.symbol).toBe("MU.US");
    expect(data.data.position.unrealized).toBeCloseTo(100);
    unsub();
  });

  it("recomputes P&L on a quote push, throttled", async () => {
    const unsub = subscribePosition("MU.US", () => {});
    await vi.advanceTimersByTimeAsync(0);

    const events: unknown[] = [];
    const unsub2 = subscribePosition("MU.US", (env) => events.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);
    events.length = 0;

    stream.push(cell("MU.US", 130));
    stream.push(cell("MU.US", 140));
    await vi.advanceTimersByTimeAsync(1000);

    const dataEvents = events.filter((e: any) => e.type === "data");
    expect(dataEvents).toHaveLength(1);
    expect((dataEvents[0] as any).data.position.last).toBe(140);
    unsub();
    unsub2();
  });

  it("stops delivery after unsubscribe and releases the symbol", async () => {
    const events: unknown[] = [];
    const unsub = subscribePosition("MU.US", (env) => events.push(JSON.parse(env)));
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    expect(stream.release).toHaveBeenCalledWith(["MU.US"]);

    const countBefore = events.length;
    stream.push(cell("MU.US", 999));
    await vi.advanceTimersByTimeAsync(2000);
    expect(events).toHaveLength(countBefore);
  });
});
