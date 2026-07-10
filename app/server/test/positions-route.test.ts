import { createApplication } from "@tsuki-hono/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawPortfolio } from "../src/services/marketdata/types.js";

const provider = vi.hoisted(() => ({
  name: "mock",
  capabilities: new Set(["portfolio"]),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn(),
  getPortfolio: vi.fn() as ReturnType<typeof vi.fn> | undefined,
}));

vi.mock("../src/services/marketdata/registry.js", () => ({ getProvider: () => provider }));

const { summarizePortfolio } = await import("../src/modules/positions/positions.utils.js");
const { ClientError } = await import("../src/errors.js");
const { AppExceptionFilter } = await import("../src/filters/app-exception.filter.js");
const { PositionsModule } = await import("../src/modules/positions/positions.module.js");

function makePortfolio(): RawPortfolio {
  return {
    overview: {
      total_asset: "25770.89",
      market_cap: "25709.77",
      total_cash: "61.12",
      total_pl: "-2155.929",
      total_today_pl: "-1363.054",
      currency: "USD",
    },
    holdings: [
      {
        symbol: "MRVL.US",
        name: "Marvell Tech",
        currency: "USD",
        quantity: "6",
        cost_price: "303.635",
        market_price: "246.266",
        market_value: "1477.596",
        prev_close: "272.050",
      },
    ],
  };
}

let app: Awaited<ReturnType<typeof createApplication>>;

async function testApp() {
  app = await createApplication(PositionsModule, { globalPrefix: "/api" });
  app.useGlobalFilters(new AppExceptionFilter());
  return app;
}

afterEach(async () => {
  await app?.close?.();
});

beforeEach(() => {
  provider.getPortfolio = vi.fn();
});

describe("summarizePortfolio", () => {
  it("converts strings to numbers and derives pnl per holding", () => {
    const data = summarizePortfolio(makePortfolio());
    expect(data.total_asset).toBeCloseTo(25770.89);
    expect(data.cash).toBeCloseTo(61.12);
    expect(data.today_pl).toBeCloseTo(-1363.054);
    const [pos] = data.positions;
    expect(pos.pnl).toBeCloseTo((246.266 - 303.635) * 6);
    expect(pos.pnl_pct).toBeCloseTo((246.266 / 303.635 - 1) * 100);
  });
});

describe("GET /api/positions", () => {
  it("returns the summarized portfolio", async () => {
    provider.getPortfolio!.mockResolvedValue(makePortfolio());
    const a = await testApp();
    const res = await a.getInstance().request("/api/positions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.positions).toHaveLength(1);
    expect(body.data.positions[0].symbol).toBe("MRVL.US");
  });

  it("serves the cached summary within the TTL without re-calling the provider", async () => {
    provider.getPortfolio!.mockResolvedValue(makePortfolio());
    const a = await testApp();
    await a.getInstance().request("/api/positions");
    await a.getInstance().request("/api/positions");
    expect(provider.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it("501s when the provider has no portfolio support", async () => {
    provider.getPortfolio = undefined;
    const a = await testApp();
    const res = await a.getInstance().request("/api/positions");
    expect(res.status).toBe(501);
  });

  it("propagates provider failures", async () => {
    provider.getPortfolio!.mockRejectedValue(new ClientError("longbridge portfolio failed", undefined, 502));
    const a = await testApp();
    const res = await a.getInstance().request("/api/positions");
    expect(res.status).toBe(502);
  });
});
