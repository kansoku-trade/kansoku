import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartDoc, ChartMeta } from "../../shared/types.js";

const longbridge = vi.hoisted(() => ({
  fetchFlow: vi.fn(),
  fetchCapitalDistribution: vi.fn(),
  fetchKline: vi.fn(),
  fetchPositions: vi.fn(),
  longbridgeJson: vi.fn(),
}));

const store = vi.hoisted(() => ({
  listCharts: vi.fn(),
  loadChart: vi.fn(),
}));

vi.mock("../src/services/longbridge.js", () => longbridge);
vi.mock("../src/services/store.js", () => store);

const { symbolsRoute } = await import("../src/routes/symbols.js");
const { ClientError } = await import("../src/errors.js");

async function testApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ClientError) {
      return reply.status(err.status).send({ ok: false, error: err.message, hint: err.hint });
    }
    return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
  });
  await app.register(symbolsRoute);
  return app;
}

function bar(time: string, o: number, h: number, l: number, c: number, v = 1000) {
  return { time, open: o, high: h, low: l, close: c, volume: v };
}

function makeMeta(overrides: Partial<ChartMeta> = {}): ChartMeta {
  return {
    id: "2026-07-02-mu-intraday",
    schema_version: 2,
    type: "intraday",
    title: "MU 短线多周期",
    symbol: "MU.US",
    created_at: "2026-07-02T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function makeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    ...makeMeta(),
    input: { symbol: "MU.US", prediction: null },
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
    ...overrides,
  };
}

beforeEach(() => {
  longbridge.fetchFlow.mockReset();
  longbridge.fetchCapitalDistribution.mockReset();
  longbridge.fetchKline.mockReset();
  longbridge.fetchPositions.mockReset();
  longbridge.longbridgeJson.mockReset();
  store.listCharts.mockReset();
  store.loadChart.mockReset();
});

describe("symbol normalization", () => {
  it("normalizes a lowercase bare ticker to <SYM>.US before calling the fetcher", async () => {
    longbridge.fetchFlow.mockResolvedValue([]);
    longbridge.fetchCapitalDistribution.mockResolvedValue(null);
    const app = await testApp();
    await app.inject("/mu/flow");
    expect(longbridge.fetchFlow).toHaveBeenCalledWith("MU.US");
    expect(longbridge.fetchCapitalDistribution).toHaveBeenCalledWith("MU.US");
  });

  it("rejects a symbol with invalid characters", async () => {
    const app = await testApp();
    const res = await app.inject("/m%20u!/flow");
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /:sym/flow", () => {
  it("degrades gracefully when distribution fetch rejects", async () => {
    longbridge.fetchFlow.mockResolvedValue([{ time: "2026-07-02T13:30:00Z", inflow: "10" }]);
    longbridge.fetchCapitalDistribution.mockRejectedValue(new Error("upstream down"));
    const app = await testApp();
    const res = await app.inject("/MU.US/flow");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.distribution).toBeNull();
    expect(body.data.curve).toHaveLength(1);
  });

  it("propagates the flow fetch rejection status", async () => {
    const { ClientError: CE } = await import("../src/errors.js");
    longbridge.fetchFlow.mockRejectedValue(new CE("longbridge down", undefined, 502));
    longbridge.fetchCapitalDistribution.mockResolvedValue(null);
    const app = await testApp();
    const res = await app.inject("/MU.US/flow");
    expect(res.statusCode).toBe(502);
  });
});

describe("GET /:sym/benchmark", () => {
  it("excludes the requested symbol from the benchmark set", async () => {
    longbridge.fetchKline.mockResolvedValue([bar("2026-07-02T13:30:00Z", 100, 101, 99, 100)]);
    const app = await testApp();
    const res = await app.inject("/SMH.US/benchmark");
    expect(res.statusCode).toBe(200);
    expect(longbridge.fetchKline).toHaveBeenCalledTimes(2);
    const symbolsFetched = longbridge.fetchKline.mock.calls.map((c) => c[0]);
    expect(symbolsFetched).toEqual(["SMH.US", "QQQ.US"]);
    const body = res.json();
    expect(body.data.map((s: { symbol: string }) => s.symbol)).toEqual(["SMH.US", "QQQ.US"]);
  });

  it("filters out pre-market bars before building the benchmark series", async () => {
    const preMarketBar = bar("2026-07-02T08:00:00Z", 100, 101, 99, 100);
    const regularBar = bar("2026-07-02T13:30:00Z", 100, 105, 99, 104);
    longbridge.fetchKline.mockImplementation(async (sym: string) =>
      sym === "MU.US" ? [preMarketBar, regularBar] : [regularBar],
    );
    const app = await testApp();
    const res = await app.inject("/MU.US/benchmark");
    const body = res.json();
    const muSeries = body.data.find((s: { symbol: string }) => s.symbol === "MU.US");
    expect(muSeries.points).toHaveLength(1);
    expect(muSeries.points[0].time).toBe(Date.parse(regularBar.time));
  });
});

describe("GET /:sym/position", () => {
  it("returns distances when the symbol is held and an entry plan exists", async () => {
    longbridge.fetchPositions.mockResolvedValue([
      { available: "6", cost_price: "100", currency: "USD", market: "US", name: "Micron", symbol: "MU.US", quantity: "6" },
    ]);
    longbridge.longbridgeJson.mockResolvedValue([
      { symbol: "MU.US", last: "110", prev_close: "108", change_percentage: "1.8" },
    ]);
    store.listCharts.mockResolvedValue([makeMeta()]);
    store.loadChart.mockResolvedValue(
      makeDoc({ built: { kind: "intraday", entryPlan: { stop: 100, target1: 120, target2: 130 } } as unknown as ChartDoc["built"] }),
    );
    const app = await testApp();
    const res = await app.inject("/MU.US/position");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.shares).toBe(6);
    expect(body.data.distances).toEqual({
      stop_pct: (100 / 110 - 1) * 100,
      target1_pct: (120 / 110 - 1) * 100,
      target2_pct: (130 / 110 - 1) * 100,
    });
  });

  it("returns null data when the symbol is not held", async () => {
    longbridge.fetchPositions.mockResolvedValue([]);
    longbridge.longbridgeJson.mockResolvedValue([
      { symbol: "MU.US", last: "110", prev_close: "108", change_percentage: "1.8" },
    ]);
    store.listCharts.mockResolvedValue([]);
    const app = await testApp();
    const res = await app.inject("/MU.US/position");
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
  });

  it("502s when the quote fetch returns an empty array", async () => {
    longbridge.fetchPositions.mockResolvedValue([]);
    longbridge.longbridgeJson.mockResolvedValue([]);
    const app = await testApp();
    const res = await app.inject("/MU.US/position");
    expect(res.statusCode).toBe(502);
  });
});

describe("GET /:sym/analyses", () => {
  it("computes an outcome for a doc with prediction and entry plan", async () => {
    const doc = makeDoc({
      input: {
        symbol: "MU.US",
        prediction: { direction: "long", anchor: { timeframe: "m15", time: "2026-07-02T13:30:00Z", price: 100 } },
      },
      built: { kind: "intraday", entryPlan: { stop: 90, target1: 120 } } as unknown as ChartDoc["built"],
    });
    store.listCharts.mockResolvedValue([makeMeta()]);
    store.loadChart.mockResolvedValue(doc);
    longbridge.fetchKline.mockResolvedValue([bar("2026-07-02T13:45:00Z", 100, 122, 99, 121)]);

    const app = await testApp();
    const res = await app.inject("/MU.US/analyses");
    expect(res.statusCode).toBe(200);
    const [row] = res.json().data;
    expect(row.direction).toBe("long");
    expect(row.outcome.status).toBe("hit_target");
  });

  it("returns nulls for a doc without a prediction", async () => {
    store.listCharts.mockResolvedValue([makeMeta()]);
    store.loadChart.mockResolvedValue(makeDoc());
    longbridge.fetchKline.mockResolvedValue([]);

    const app = await testApp();
    const res = await app.inject("/MU.US/analyses");
    const [row] = res.json().data;
    expect(row.direction).toBeNull();
    expect(row.anchor).toBeNull();
    expect(row.outcome).toBeNull();
  });

  it("degrades to null outcomes for every row when the shared kline fetch fails", async () => {
    const doc = makeDoc({
      input: {
        symbol: "MU.US",
        prediction: { direction: "long", anchor: { timeframe: "m15", time: "2026-07-02T13:30:00Z", price: 100 } },
      },
      built: { kind: "intraday", entryPlan: { stop: 90, target1: 120 } } as unknown as ChartDoc["built"],
    });
    store.listCharts.mockResolvedValue([makeMeta()]);
    store.loadChart.mockResolvedValue(doc);
    longbridge.fetchKline.mockRejectedValue(new Error("upstream down"));

    const app = await testApp();
    const res = await app.inject("/MU.US/analyses");
    expect(res.statusCode).toBe(200);
    const [row] = res.json().data;
    expect(row.outcome).toBeNull();
  });
});

describe("GET /:sym/latest", () => {
  it("returns the newest doc with url and prediction_stale", async () => {
    store.listCharts.mockResolvedValue([makeMeta()]);
    store.loadChart.mockResolvedValue(makeDoc());
    const app = await testApp();
    const res = await app.inject("/MU.US/latest");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.url).toContain(body.data.id);
    expect(typeof body.data.prediction_stale).toBe("boolean");
  });

  it("404s when there are no intraday docs for the symbol", async () => {
    store.listCharts.mockResolvedValue([]);
    const app = await testApp();
    const res = await app.inject("/MU.US/latest");
    expect(res.statusCode).toBe(404);
  });
});
