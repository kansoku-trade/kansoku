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
});
