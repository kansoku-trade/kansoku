import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtocolQuote } from "../src/services/marketdata/longbridgeProtocol.js";
import type { LongbridgeQuoteSocket } from "../src/services/marketdata/longbridgeSocket.js";

const provider = vi.hoisted(() => ({
  getQuotes: vi.fn().mockResolvedValue([]),
  getKline: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/services/marketdata/registry.js", () => ({ getProvider: () => provider }));

const { LongbridgeStream } = await import("../src/services/marketdata/longbridgeStream.js");

interface FakeSocket {
  emitQuote: (quote: ProtocolQuote) => void;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function makeSocket(): { socket: LongbridgeQuoteSocket; fake: FakeSocket } {
  let emitQuote: (quote: ProtocolQuote) => void = () => {};
  const subscribe = vi.fn().mockResolvedValue(undefined);
  const unsubscribe = vi.fn().mockResolvedValue(undefined);
  const socket = {
    onQuote(listener: (quote: ProtocolQuote) => void) {
      emitQuote = listener;
      return () => {};
    },
    onTrade() {
      return () => {};
    },
    subscribe,
    unsubscribe,
  } as unknown as LongbridgeQuoteSocket;
  return { socket, fake: { emitQuote: (q) => emitQuote(q), subscribe, unsubscribe } };
}

function quote(symbol: string, lastDone: number, timestamp: number, tradeSession = 0): ProtocolQuote {
  return {
    symbol,
    sequence: timestamp,
    lastDone,
    timestamp,
    volume: 1,
    currentVolume: 1,
    turnover: lastDone,
    currentTurnover: lastDone,
    tradeSession,
    tag: 0,
  };
}

const US_REGULAR = 1784124000;
const US_PRE = 1784109600;
const HK_LUNCH = 1784089800;
const CN_REGULAR_AM = 1784080800;

beforeEach(() => {
  provider.getQuotes.mockReset().mockResolvedValue([]);
  provider.getKline.mockReset().mockResolvedValue([]);
});

describe("QuoteStream ref-counted quote subscription", () => {
  it("subscribes upstream once for double-retained symbols and tears down on the last release", async () => {
    const { socket, fake } = makeSocket();
    const stream = new LongbridgeStream({ socket });

    await stream.retain(["AAA.US"]);
    await stream.retain(["AAA.US"]);
    const quoteSubscribes = fake.subscribe.mock.calls.filter((c) => (c[0] as string[]).includes("AAA.US"));
    expect(quoteSubscribes).toHaveLength(1);

    await stream.release(["AAA.US"]);
    expect(fake.unsubscribe).not.toHaveBeenCalled();

    await stream.release(["AAA.US"]);
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fake.unsubscribe.mock.calls[0][0]).toEqual(["AAA.US"]);
  });
});

describe("QuoteStream event delivery", () => {
  it("forwards each push to onUpdate listeners and updates the snapshot", () => {
    const { socket, fake } = makeSocket();
    const stream = new LongbridgeStream({ socket });
    const received: number[] = [];
    stream.onUpdate((cell) => received.push(cell.last));

    fake.emitQuote(quote("AAA.US", 100, US_REGULAR));
    fake.emitQuote(quote("AAA.US", 101, US_REGULAR));

    expect(received).toEqual([100, 101]);
    expect(stream.getSnapshot("AAA.US")?.last).toBe(101);
  });
});

describe("QuoteStream snapshot merge semantics", () => {
  it("keeps the regular reference while surfacing the extended-session last", async () => {
    const { socket, fake } = makeSocket();
    const stream = new LongbridgeStream({ socket });
    provider.getQuotes.mockResolvedValue([
      { symbol: "AAA.US", last: "50", prev_close: "48", change_percentage: "4.17" },
    ]);

    await stream.retain(["AAA.US"]);
    fake.emitQuote(quote("AAA.US", 100, US_PRE, 1));

    const cell = stream.getSnapshot("AAA.US");
    expect(cell?.last).toBe(100);
    expect(cell?.regularLast).toBe(50);
    expect(cell?.session).toBe("盘前");
  });
});

describe("QuoteStream prev-close self-heal", () => {
  it("reports pct as null while prev close is unknown, then heals via the retry timer", async () => {
    vi.useFakeTimers();
    try {
      const { socket, fake } = makeSocket();
      const stream = new LongbridgeStream({ socket });
      provider.getQuotes
        .mockRejectedValueOnce(new Error("longbridge CLI 执行失败"))
        .mockResolvedValue([{ symbol: "AAA.US", last: "50", prev_close: "48", change_percentage: "4.17" }]);
      const received: Array<number | null> = [];
      stream.onUpdate((cell) => received.push(cell.pct));

      await stream.retain(["AAA.US"]);
      fake.emitQuote(quote("AAA.US", 100, US_PRE, 1));
      expect(stream.getSnapshot("AAA.US")?.pct).toBeNull();

      await vi.advanceTimersByTimeAsync(60_000);

      const cell = stream.getSnapshot("AAA.US");
      expect(cell?.pct).toBeCloseTo((100 / 48 - 1) * 100, 6);
      expect(received).toEqual([null, cell?.pct]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps retrying while the snapshot fetch keeps failing", async () => {
    vi.useFakeTimers();
    try {
      const { socket, fake } = makeSocket();
      const stream = new LongbridgeStream({ socket });
      provider.getQuotes.mockRejectedValue(new Error("longbridge CLI 执行失败"));

      await stream.retain(["AAA.US"]);
      fake.emitQuote(quote("AAA.US", 100, US_PRE, 1));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(stream.getSnapshot("AAA.US")?.pct).toBeNull();

      provider.getQuotes.mockResolvedValue([
        { symbol: "AAA.US", last: "50", prev_close: "48", change_percentage: "4.17" },
      ]);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(stream.getSnapshot("AAA.US")?.pct).toBeCloseTo((100 / 48 - 1) * 100, 6);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("QuoteStream session labels are derived from market sessions", () => {
  it("labels an HK lunch push as off-session, an SH regular push as day, and a US pre push as pre-market", () => {
    const { socket, fake } = makeSocket();
    const stream = new LongbridgeStream({ socket });

    fake.emitQuote(quote("700.HK", 300, HK_LUNCH));
    fake.emitQuote(quote("600519.SH", 1600, CN_REGULAR_AM));
    fake.emitQuote(quote("AAA.US", 100, US_PRE, 1));

    expect(stream.getSnapshot("700.HK")?.session).toBe("休市");
    expect(stream.getSnapshot("600519.SH")?.session).toBe("日盘");
    expect(stream.getSnapshot("AAA.US")?.session).toBe("盘前");
  });
});
