import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdjustType, TradeSessions } from "longbridge";
import type { QuotePort, TradePort } from "../src/services/marketdata/longbridge.js";

const childProcess = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: childProcess.execFile,
}));

function decimal(value: string) {
  return {
    toNumber: () => Number(value),
    toString: () => value,
  };
}

function candle(overrides: Partial<{ time: string; open: string; high: string; low: string; close: string; volume: number }> = {}) {
  const time = overrides.time ?? "2026-07-06T14:30:00.000Z";
  return {
    timestamp: new Date(time),
    open: decimal(overrides.open ?? "100"),
    high: decimal(overrides.high ?? "101"),
    low: decimal(overrides.low ?? "99"),
    close: decimal(overrides.close ?? "100.5"),
    volume: overrides.volume ?? 1000,
    turnover: decimal("100500"),
    tradeSession: 0,
  };
}

function quote(overrides: Partial<{ symbol: string; last: string; prev: string }> = {}) {
  return {
    symbol: overrides.symbol ?? "NVDA.US",
    lastDone: decimal(overrides.last ?? "110"),
    prevClose: decimal(overrides.prev ?? "100"),
    open: decimal("100"),
    high: decimal("111"),
    low: decimal("99"),
    timestamp: new Date("2026-07-06T20:00:00.000Z"),
    volume: 1_000_000,
    turnover: decimal("100000000"),
    tradeStatus: 0,
    preMarketQuote: null,
    postMarketQuote: null,
    overnightQuote: null,
  };
}

async function loadProvider() {
  const { createLongbridgeProvider } = await import("../src/services/marketdata/longbridge.js");
  return createLongbridgeProvider;
}

describe("longbridgeProvider (SDK-backed)", () => {
  beforeEach(() => {
    vi.resetModules();
    childProcess.execFile.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getKline maps SDK candlesticks to RawBar[], normalizing the legacy period vocabulary", async () => {
    const createLongbridgeProvider = await loadProvider();
    const candlesticks = vi.fn().mockResolvedValue([candle({ time: "2026-07-06T14:30:00.000Z" })]);
    const quotePort: Partial<QuotePort> = { candlesticks: candlesticks as unknown as QuotePort["candlesticks"] };
    const provider = createLongbridgeProvider(async () => quotePort as QuotePort, async () => ({}) as TradePort);

    const bars = await provider.getKline("NVDA.US", "1h", 1);

    expect(candlesticks).toHaveBeenCalledWith("NVDA.US", expect.anything(), 1, AdjustType.NoAdjust, TradeSessions.Intraday);
    expect(bars).toEqual([
      { time: "2026-07-06T14:30:00.000Z", open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
    ]);
  });

  it("getKline maps session=\"all\" to TradeSessions.All", async () => {
    const createLongbridgeProvider = await loadProvider();
    const candlesticks = vi.fn().mockResolvedValue([candle()]);
    const provider = createLongbridgeProvider(
      async () => ({ candlesticks } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    await provider.getKline("NVDA.US", "5m", 1, "all");

    expect(candlesticks).toHaveBeenCalledWith("NVDA.US", expect.anything(), 1, AdjustType.NoAdjust, TradeSessions.All);
  });

  it("getKline rejects a period outside the unified vocabulary", async () => {
    const createLongbridgeProvider = await loadProvider();
    const provider = createLongbridgeProvider(async () => ({}) as QuotePort, async () => ({}) as TradePort);

    await expect(provider.getKline("NVDA.US", "3d", 1)).rejects.toThrow('unsupported period "3d"');
  });

  it("getKline pages with historyCandlesticksByOffset when the first call returns fewer bars than requested", async () => {
    const createLongbridgeProvider = await loadProvider();
    const first = candle({ time: "2026-07-06T15:00:00.000Z" });
    const older = candle({ time: "2026-07-06T14:00:00.000Z" });
    const candlesticks = vi.fn().mockResolvedValue([first]);
    const historyCandlesticksByOffset = vi.fn().mockResolvedValue([older]);
    const provider = createLongbridgeProvider(
      async () =>
        ({ candlesticks, historyCandlesticksByOffset } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    const bars = await provider.getKline("NVDA.US", "5m", 2);

    expect(historyCandlesticksByOffset).toHaveBeenCalledTimes(1);
    expect(bars.map((b) => b.time)).toEqual(["2026-07-06T14:00:00.000Z", "2026-07-06T15:00:00.000Z"]);
  });

  it("getQuotes maps SecurityQuote Decimal fields to RawQuote strings", async () => {
    const createLongbridgeProvider = await loadProvider();
    const provider = createLongbridgeProvider(
      async () => ({ quote: vi.fn().mockResolvedValue([quote()]) } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    const rows = await provider.getQuotes(["NVDA.US"]);

    expect(rows).toEqual([
      { symbol: "NVDA.US", last: "110", prev_close: "100", change_percentage: "10", pre_market: undefined, post_market: undefined, overnight: undefined },
    ]);
  });

  it("getFlow maps CapitalFlowLine[] to FlowRow[]", async () => {
    const createLongbridgeProvider = await loadProvider();
    const capitalFlow = vi.fn().mockResolvedValue([{ inflow: decimal("12345.6"), timestamp: new Date("2026-07-06T13:00:00.000Z") }]);
    const provider = createLongbridgeProvider(
      async () => ({ capitalFlow } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    await expect(provider.getFlow!("NVDA.US")).resolves.toEqual([
      { time: "2026-07-06T13:00:00.000Z", inflow: "12345.6" },
    ]);
  });

  it("getCapitalDistribution maps nested Decimal buckets", async () => {
    const createLongbridgeProvider = await loadProvider();
    const capitalDistribution = vi.fn().mockResolvedValue({
      timestamp: new Date("2026-07-06T13:00:00.000Z"),
      capitalIn: { large: decimal("1"), medium: decimal("2"), small: decimal("3") },
      capitalOut: { large: decimal("4"), medium: decimal("5"), small: decimal("6") },
    });
    const provider = createLongbridgeProvider(
      async () => ({ capitalDistribution } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    await expect(provider.getCapitalDistribution!("NVDA.US")).resolves.toEqual({
      symbol: "NVDA.US",
      timestamp: "2026-07-06T13:00:00.000Z",
      capital_in: { large: "1", medium: "2", small: "3" },
      capital_out: { large: "4", medium: "5", small: "6" },
    });
  });

  it("getPositions flattens StockPositionsResponse channels and maps Market to a string label", async () => {
    const createLongbridgeProvider = await loadProvider();
    const stockPositions = vi.fn().mockResolvedValue({
      channels: [
        {
          accountChannel: "lb",
          positions: [
            {
              symbol: "NVDA.US",
              symbolName: "NVIDIA",
              quantity: decimal("10"),
              availableQuantity: decimal("10"),
              currency: "USD",
              costPrice: decimal("90"),
              market: 1,
            },
          ],
        },
      ],
    });
    const provider = createLongbridgeProvider(
      async () => ({}) as QuotePort,
      async () => ({ stockPositions } as unknown as TradePort),
    );

    await expect(provider.getPositions!()).resolves.toEqual([
      { symbol: "NVDA.US", name: "NVIDIA", currency: "USD", quantity: "10", available: "10", cost_price: "90", market: "US" },
    ]);
  });

  it("getPortfolio combines stockPositions + quote + accountBalance into RawPortfolio", async () => {
    const createLongbridgeProvider = await loadProvider();
    const stockPositions = vi.fn().mockResolvedValue({
      channels: [
        {
          accountChannel: "lb",
          positions: [
            {
              symbol: "NVDA.US",
              symbolName: "NVIDIA",
              quantity: decimal("10"),
              availableQuantity: decimal("10"),
              currency: "USD",
              costPrice: decimal("90"),
              market: 1,
            },
          ],
        },
      ],
    });
    const accountBalance = vi.fn().mockResolvedValue([{ totalCash: decimal("5000"), currency: "USD" }]);
    const quoteFn = vi.fn().mockResolvedValue([quote({ symbol: "NVDA.US", last: "110", prev: "108" })]);
    const provider = createLongbridgeProvider(
      async () => ({ quote: quoteFn } as unknown as QuotePort),
      async () => ({ stockPositions, accountBalance } as unknown as TradePort),
    );

    const portfolio = await provider.getPortfolio!();

    expect(portfolio.holdings).toEqual([
      { symbol: "NVDA.US", name: "NVIDIA", currency: "USD", quantity: "10", cost_price: "90", market_price: "110", market_value: "1100", prev_close: "108" },
    ]);
    expect(portfolio.overview).toEqual({
      total_asset: "6100",
      market_cap: "1100",
      total_cash: "5000",
      total_pl: "200",
      total_today_pl: "20",
      currency: "USD",
    });
  });

  it("getWatchlistSymbols flattens watchlist groups into a deduped symbol list", async () => {
    const createLongbridgeProvider = await loadProvider();
    const watchlist = vi.fn().mockResolvedValue([
      { id: 1, name: "g1", securities: [{ symbol: "MU.US" }, { symbol: "NVDA.US" }] },
      { id: 2, name: "g2", securities: [{ symbol: "MU.US" }] },
    ]);
    const provider = createLongbridgeProvider(
      async () => ({ watchlist } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    await expect(provider.getWatchlistSymbols!()).resolves.toEqual(["MU.US", "NVDA.US"]);
  });

  it("maps a rejected SDK call with a non-auth message to a 502 ClientError with an auth/config hint", async () => {
    const createLongbridgeProvider = await loadProvider();
    const provider = createLongbridgeProvider(
      async () => ({ quote: vi.fn().mockRejectedValue(new Error("network timeout")) } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    await expect(provider.getQuotes(["NVDA.US"])).rejects.toThrow(/longbridge quote failed: network timeout/);
    await expect(provider.getQuotes(["NVDA.US"])).rejects.toMatchObject({ status: 502, hint: expect.stringMatching(/credentials/i), code: undefined });
  });

  it("does not mislabel an entitlement/permission rejection as CREDENTIALS_REJECTED", async () => {
    const createLongbridgeProvider = await loadProvider();
    const provider = createLongbridgeProvider(
      async () => ({ quote: vi.fn().mockRejectedValue(new Error("unauthorized to trade this security")) } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    await expect(provider.getQuotes(["NVDA.US"])).rejects.toMatchObject({
      status: 502,
      code: undefined,
      message: expect.stringMatching(/unauthorized to trade this security/),
    });
  });

  it("maps an auth-shaped rejection (expired/invalid token) to a 503 ClientError with code CREDENTIALS_REJECTED", async () => {
    const createLongbridgeProvider = await loadProvider();
    const provider = createLongbridgeProvider(
      async () => ({ quote: vi.fn().mockRejectedValue(new Error("token expired")) } as unknown as QuotePort),
      async () => ({}) as TradePort,
    );

    await expect(provider.getQuotes(["NVDA.US"])).rejects.toMatchObject({
      status: 503,
      code: "CREDENTIALS_REJECTED",
      message: expect.stringMatching(/longbridge quote failed: token expired/),
      hint: expect.stringMatching(/rejected the configured credentials/i),
    });
  });

  it("maps a NoCredentialsError to a 503 ClientError with code NO_CREDENTIALS", async () => {
    const { NoCredentialsError } = await import("../src/services/credentials/errors.js");
    const createLongbridgeProvider = await loadProvider();
    const provider = createLongbridgeProvider(
      async () => {
        throw new NoCredentialsError();
      },
      async () => ({}) as TradePort,
    );

    await expect(provider.getQuotes(["NVDA.US"])).rejects.toMatchObject({
      status: 503,
      code: "NO_CREDENTIALS",
      message: "longbridge credentials not configured",
    });
  });

  it("throttles consecutive SDK calls to a minimum interval", async () => {
    vi.useFakeTimers();
    try {
      const createLongbridgeProvider = await loadProvider();
      const quoteFn = vi.fn().mockResolvedValue([quote()]);
      const provider = createLongbridgeProvider(
        async () => ({ quote: quoteFn } as unknown as QuotePort),
        async () => ({}) as TradePort,
      );

      const first = provider.getQuotes(["A.US"]);
      await vi.advanceTimersByTimeAsync(0);
      await first;

      const secondPromise = provider.getQuotes(["B.US"]);
      let resolved = false;
      void secondPromise.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(100);
      await secondPromise;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getNews still shells out to the longbridge CLI and swallows failures as an empty list", async () => {
    childProcess.execFile.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      cb(null, JSON.stringify([{ id: 1, title: "t", published_at: "2026-07-06T00:00:00Z", url: "https://x" }]), "");
    });
    const createLongbridgeProvider = await loadProvider();
    const provider = createLongbridgeProvider(async () => ({}) as QuotePort, async () => ({}) as TradePort);

    await expect(provider.getNews("NVDA.US")).resolves.toEqual([
      { id: "1", title: "t", published_at: "2026-07-06T00:00:00Z", url: "https://x" },
    ]);

    childProcess.execFile.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      cb(new Error("boom"));
    });
    await expect(provider.getNews("NVDA.US")).resolves.toEqual([]);
  });
});
