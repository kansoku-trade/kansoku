import { describe, expect, it, vi } from "vitest";
import { createLongbridgeProvider, type LongbridgeRunner } from "../src/services/marketdata/longbridge.js";

function runner(responses: Record<string, unknown>): LongbridgeRunner {
  const run = vi.fn(async (args: string[]) => {
    const key = args.join(" ");
    if (!(key in responses)) throw new Error(`unexpected command: ${key}`);
    return responses[key];
  });
  return run as LongbridgeRunner;
}

describe("longbridgeProvider (CLI-backed)", () => {
  it("maps CLI K-line values and normalizes the 60m alias", async () => {
    const run = runner({
      "kline NVDA.US --period 1h --count 1 --session all": [
        { time: "2026-07-06T14:30:00.000Z", open: "100", high: "101", low: "99", close: "100.5", volume: 1000 },
      ],
    });
    const provider = createLongbridgeProvider(run);
    await expect(provider.getKline("NVDA.US", "60m", 1, "all")).resolves.toEqual([
      { time: "2026-07-06T14:30:00.000Z", open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
    ]);
  });

  it("rejects periods unsupported by the CLI", async () => {
    const provider = createLongbridgeProvider(runner({}));
    await expect(provider.getKline("NVDA.US", "3m", 1)).rejects.toThrow('unsupported period "3m"');
  });

  it("passes quote results through the stable provider contract", async () => {
    const rows = [{ symbol: "NVDA.US", last: "110", prev_close: "100", change_percentage: "10" }];
    const provider = createLongbridgeProvider(runner({ "quote NVDA.US": rows }));
    await expect(provider.getQuotes(["NVDA.US"])).resolves.toEqual(rows);
  });

  it("prefers the WS transport for kline and quotes when available", async () => {
    const bars = [{ time: "2026-07-06T14:30:00.000Z", open: 100, high: 101, low: 99, close: 100.5, volume: 1000 }];
    const rows = [{ symbol: "NVDA.US", last: "110", prev_close: "100", change_percentage: "10.000" }];
    const transport = {
      queryQuotes: vi.fn().mockResolvedValue(rows),
      queryCandlesticks: vi.fn().mockResolvedValue(bars),
      queryCapitalFlow: vi.fn(),
      queryCapitalDistribution: vi.fn(),
      queryStaticNames: vi.fn(),
    };
    const run = vi.fn().mockRejectedValue(new Error("CLI should not run"));
    const provider = createLongbridgeProvider(run as LongbridgeRunner, () => transport);

    await expect(provider.getKline("NVDA.US", "60m", 2, "all")).resolves.toEqual(bars);
    expect(transport.queryCandlesticks).toHaveBeenCalledWith("NVDA.US", "1h", 2, "all");
    await expect(provider.getQuotes(["NVDA.US"])).resolves.toEqual(rows);
    expect(run).not.toHaveBeenCalled();
  });

  it("prefers the WS transport for capital flow and distribution when available", async () => {
    const flowRows = [{ time: "2026-07-16T14:30:00.000Z", inflow: "12" }];
    const dist = {
      symbol: "NVDA.US",
      timestamp: "2026-07-16T14:30:00.000Z",
      capital_in: { large: "1", medium: "2", small: "3" },
      capital_out: { large: "4", medium: "5", small: "6" },
    };
    const transport = {
      queryQuotes: vi.fn(),
      queryCandlesticks: vi.fn(),
      queryCapitalFlow: vi.fn().mockResolvedValue(flowRows),
      queryCapitalDistribution: vi.fn().mockResolvedValue(dist),
      queryStaticNames: vi.fn(),
    };
    const run = vi.fn().mockRejectedValue(new Error("CLI should not run"));
    const provider = createLongbridgeProvider(run as LongbridgeRunner, () => transport);

    await expect(provider.getFlow!("NVDA.US")).resolves.toEqual(flowRows);
    await expect(provider.getCapitalDistribution!("NVDA.US")).resolves.toEqual(dist);
    expect(run).not.toHaveBeenCalled();
  });

  it("falls back to the CLI when the WS capital queries fail", async () => {
    const transport = {
      queryQuotes: vi.fn(),
      queryCandlesticks: vi.fn(),
      queryCapitalFlow: vi.fn().mockRejectedValue(new Error("socket down")),
      queryCapitalDistribution: vi.fn().mockRejectedValue(new Error("socket down")),
      queryStaticNames: vi.fn(),
    };
    const run = runner({
      "capital NVDA.US --flow": [{ time: "10:00", inflow: "12" }],
      "capital NVDA.US": {
        symbol: "NVDA.US",
        timestamp: "2026-07-16T13:00:00Z",
        capital_in: { large: "1", medium: "2", small: "3" },
        capital_out: { large: "4", medium: "5", small: "6" },
      },
    });
    const provider = createLongbridgeProvider(run, () => transport);

    await expect(provider.getFlow!("NVDA.US")).resolves.toEqual([{ time: "10:00", inflow: "12" }]);
    await expect(provider.getCapitalDistribution!("NVDA.US")).resolves.toMatchObject({ symbol: "NVDA.US" });
  });

  it("falls back to the CLI when the WS transport fails", async () => {
    const transport = {
      queryQuotes: vi.fn().mockRejectedValue(new Error("connections limitation is hit")),
      queryCandlesticks: vi.fn().mockRejectedValue(new Error("connections limitation is hit")),
      queryCapitalFlow: vi.fn(),
      queryCapitalDistribution: vi.fn(),
      queryStaticNames: vi.fn(),
    };
    const rows = [{ symbol: "NVDA.US", last: "110", prev_close: "100", change_percentage: "10" }];
    const run = runner({
      "quote NVDA.US": rows,
      "kline NVDA.US --period 5m --count 2": [
        { time: "2026-07-06T14:30:00.000Z", open: "1", high: "1", low: "1", close: "1", volume: 1 },
      ],
    });
    const provider = createLongbridgeProvider(run, () => transport);

    await expect(provider.getQuotes(["NVDA.US"])).resolves.toEqual(rows);
    await expect(provider.getKline("NVDA.US", "5m", 2)).resolves.toHaveLength(1);
  });

  it("prefers the WS transport for security names and still caches per symbol", async () => {
    const transport = {
      queryQuotes: vi.fn(),
      queryCandlesticks: vi.fn(),
      queryCapitalFlow: vi.fn(),
      queryCapitalDistribution: vi.fn(),
      queryStaticNames: vi.fn().mockResolvedValue([{ symbol: "MRVL.US", name: "迈威尔科技" }]),
    };
    const run = vi.fn().mockRejectedValue(new Error("CLI should not run"));
    const provider = createLongbridgeProvider(run as LongbridgeRunner, () => transport);

    await expect(provider.getSecurityName!("MRVL.US")).resolves.toBe("迈威尔科技");
    await expect(provider.getSecurityName!("MRVL.US")).resolves.toBe("迈威尔科技");
    expect(transport.queryStaticNames).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("falls back to the CLI for security names when the WS query fails", async () => {
    const transport = {
      queryQuotes: vi.fn(),
      queryCandlesticks: vi.fn(),
      queryCapitalFlow: vi.fn(),
      queryCapitalDistribution: vi.fn(),
      queryStaticNames: vi.fn().mockRejectedValue(new Error("socket down")),
    };
    const run = runner({
      "static MRVL.US --lang zh-CN": [{ symbol: "MRVL.US", name: "迈威尔科技" }],
    });
    const provider = createLongbridgeProvider(run, () => transport);
    await expect(provider.getSecurityName!("MRVL.US")).resolves.toBe("迈威尔科技");
  });

  it("loads and caches the Chinese security name from static reference data", async () => {
    const run = runner({
      "static MRVL.US --lang zh-CN": [{ symbol: "MRVL.US", name: "迈威尔科技" }],
    });
    const provider = createLongbridgeProvider(run);

    await expect(provider.getSecurityName!("MRVL.US")).resolves.toBe("迈威尔科技");
    await expect(provider.getSecurityName!("MRVL.US")).resolves.toBe("迈威尔科技");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing Chinese security name non-fatal", async () => {
    const provider = createLongbridgeProvider(vi.fn().mockRejectedValue(new Error("offline")));
    await expect(provider.getSecurityName!("NVDA.US")).resolves.toBeNull();
  });

  it("maps and limits news while preserving the existing empty-list fallback", async () => {
    const rows = [
      { id: 1, title: "one", published_at: "2026-07-06T00:00:00Z", url: "https://one" },
      { id: 2, title: "two", published_at: "2026-07-05T00:00:00Z", url: "https://two" },
    ];
    const provider = createLongbridgeProvider(runner({ "news NVDA.US --lang zh-CN": rows }));
    await expect(provider.getNews("NVDA.US", 1)).resolves.toEqual([
      { id: "1", title: "one", published_at: "2026-07-06T00:00:00Z", url: "https://one" },
    ]);

    const failed = createLongbridgeProvider(vi.fn().mockRejectedValue(new Error("offline")));
    await expect(failed.getNews("NVDA.US")).resolves.toEqual([]);
  });

  it("maps capital, positions, portfolio, and deduplicated watchlist commands", async () => {
    const run = runner({
      "capital NVDA.US --flow": [{ time: "10:00", inflow: "12" }],
      "capital NVDA.US": {
        symbol: "NVDA.US",
        timestamp: "2026-07-06T13:00:00Z",
        capital_in: { large: "1", medium: "2", small: "3" },
        capital_out: { large: "4", medium: "5", small: "6" },
      },
      positions: [{ symbol: "NVDA.US", name: "NVIDIA", quantity: "10", available: "9", cost_price: "90", currency: "USD", market: "US" }],
      portfolio: {
        overview: { total_asset: "6100", market_cap: "1100", total_cash: "5000", total_pl: "200", total_today_pl: "20", currency: "USD" },
        holdings: [{ symbol: "NVDA.US", name: "NVIDIA", currency: "USD", quantity: "10", cost_price: "90", market_price: "110", market_value: "1100", prev_close: "108", available_quantity: "9" }],
      },
      watchlist: [
        { securities: [{ symbol: "MU.US" }, { symbol: "NVDA.US" }] },
        { securities: [{ symbol: "MU.US" }] },
      ],
    });
    const provider = createLongbridgeProvider(run);

    await expect(provider.getFlow!("NVDA.US")).resolves.toEqual([{ time: "10:00", inflow: "12" }]);
    await expect(provider.getCapitalDistribution!("NVDA.US")).resolves.toMatchObject({ symbol: "NVDA.US" });
    await expect(provider.getPositions!()).resolves.toHaveLength(1);
    await expect(provider.getPortfolio!()).resolves.toMatchObject({ holdings: [{ symbol: "NVDA.US" }] });
    await expect(provider.getWatchlistSymbols!()).resolves.toEqual(["MU.US", "NVDA.US"]);
  });

  it("maps CLI failures to the existing ClientError envelope", async () => {
    const provider = createLongbridgeProvider(vi.fn().mockRejectedValue(new Error("not logged in")));
    await expect(provider.getQuotes(["NVDA.US"])).rejects.toMatchObject({ status: 502, message: expect.stringContaining("not logged in") });
  });

  it("finds the next earnings entry on or after the given date, matching the symbol's counter_id", async () => {
    const run = runner({
      "finance-calendar report --symbol NVDA.US": {
        list: [
          { date: "2026-07-01", infos: [{ counter_id: "OTHER.US", content: "OTHER Q2" }] },
          {
            date: "2026-07-20",
            infos: [
              { counter_id: "OTHER.US", content: "OTHER Q3" },
              { counter_id: "NVDA.US", content: "NVDA Q2 2026" },
            ],
          },
        ],
      },
    });
    const provider = createLongbridgeProvider(run);
    await expect(provider.getEarningsCalendar!("NVDA.US", "2026-07-10")).resolves.toEqual({
      date: "2026-07-20",
      title: "NVDA Q2 2026",
    });
  });

  it("returns null when no earnings entry exists on or after the given date", async () => {
    const run = runner({
      "finance-calendar report --symbol NVDA.US": {
        list: [{ date: "2026-07-01", infos: [{ counter_id: "NVDA.US", content: "past" }] }],
      },
    });
    const provider = createLongbridgeProvider(run);
    await expect(provider.getEarningsCalendar!("NVDA.US", "2026-07-10")).resolves.toBeNull();
  });

  it("parses macro calendar rows for a supported market, filtering by star and dropping the '--' sentinel", async () => {
    const run = runner({
      "finance-calendar macrodata --market US --star 3 --start 2026-07-10 --end 2026-07-13": {
        list: [
          {
            date: "2026-07-11",
            infos: [
              {
                content: "CPI",
                datetime: String(Math.floor(Date.parse("2026-07-11T04:00:00.000Z") / 1000)),
                star: 3,
                data_kv: [
                  { type: "estimate", value: "3.1%" },
                  { type: "previous", value: "--" },
                ],
              },
              { content: "low star", datetime: "1752209800", star: 2, data_kv: [] },
            ],
          },
        ],
      },
    });
    const provider = createLongbridgeProvider(run);
    await expect(provider.getMacroCalendar!("US", "2026-07-10", "2026-07-13", 3)).resolves.toEqual({
      supported: true,
      items: [{ ts: "2026-07-11T04:00:00.000Z", title: "CPI", estimate: "3.1%", previous: null }],
    });
  });

  it("declares macro calendar unsupported for HK/CN without calling the CLI", async () => {
    const run = runner({});
    const provider = createLongbridgeProvider(run);
    await expect(provider.getMacroCalendar!("HK", "2026-07-10", "2026-07-13", 3)).resolves.toEqual({
      supported: false,
    });
    await expect(provider.getMacroCalendar!("CN", "2026-07-10", "2026-07-13", 3)).resolves.toEqual({
      supported: false,
    });
    expect(run).not.toHaveBeenCalled();
  });
});
