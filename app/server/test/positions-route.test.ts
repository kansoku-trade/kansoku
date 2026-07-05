import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const { positionsRoute, summarizePortfolio } = await import("../src/routes/positions.js");
const { ClientError } = await import("../src/errors.js");

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

async function testApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ClientError) {
      return reply.status(err.status).send({ ok: false, error: err.message, hint: err.hint });
    }
    return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
  });
  await app.register(positionsRoute);
  return app;
}

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
    const app = await testApp();
    const res = await app.inject("/");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.positions).toHaveLength(1);
    expect(body.data.positions[0].symbol).toBe("MRVL.US");
  });

  it("serves the cached summary within the TTL without re-calling the provider", async () => {
    provider.getPortfolio!.mockResolvedValue(makePortfolio());
    const app = await testApp();
    await app.inject("/");
    await app.inject("/");
    expect(provider.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it("501s when the provider has no portfolio support", async () => {
    provider.getPortfolio = undefined;
    const app = await testApp();
    const res = await app.inject("/");
    expect(res.statusCode).toBe(501);
  });

  it("propagates provider failures", async () => {
    provider.getPortfolio!.mockRejectedValue(new ClientError("longbridge portfolio failed", undefined, 502));
    const app = await testApp();
    const res = await app.inject("/");
    expect(res.statusCode).toBe(502);
  });
});
