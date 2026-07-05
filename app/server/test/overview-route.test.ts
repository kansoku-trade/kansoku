import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartDoc, ChartMeta } from "../../shared/types.js";

const provider = vi.hoisted(() => ({
  name: "mock",
  capabilities: new Set<string>(),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn(),
}));

const store = vi.hoisted(() => ({
  listCharts: vi.fn(),
  loadChart: vi.fn(),
}));

const comments = vi.hoisted(() => ({
  listComments: vi.fn(),
}));

const usage = vi.hoisted(() => ({
  listUsage: vi.fn(),
  summarizeUsage: vi.fn(),
}));

vi.mock("../src/services/marketdata/registry.js", () => ({ getProvider: () => provider }));
vi.mock("../src/services/store.js", () => store);
vi.mock("../src/ai/comments.js", () => comments);
vi.mock("../src/ai/usageStore.js", () => usage);
vi.mock("../src/services/cockpit/outcomeCache.js", () => ({
  getResolvedOutcomes: async () => new Map(),
  saveResolvedOutcome: async () => {},
}));

const { overviewRoute } = await import("../src/routes/overview.js");
const { easternDate } = await import("../src/services/session.js");

async function testApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(overviewRoute);
  return app;
}

function makeMeta(overrides: Partial<ChartMeta> = {}): ChartMeta {
  return {
    id: `${easternDate()}-mu-intraday`,
    schema_version: 2,
    type: "intraday",
    title: "MU 短线多周期",
    symbol: "MU.US",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    ...makeMeta(),
    input: {
      symbol: "MU.US",
      prediction: {
        direction: "long",
        anchor: { timeframe: "m15", time: new Date(Date.now() - 3_600_000).toISOString(), price: 100 },
      },
    },
    built: { kind: "intraday", entryPlan: { stop: 90, target1: 120 } } as unknown as ChartDoc["built"],
    ...overrides,
  };
}

const emptyUsage = {
  date: easternDate(),
  runs: 0,
  calls: 0,
  total_tokens: 0,
  cost_total: 0,
  by_layer: {},
};

beforeEach(() => {
  provider.getKline.mockReset();
  provider.getQuotes.mockReset();
  store.listCharts.mockReset();
  store.loadChart.mockReset();
  comments.listComments.mockReset();
  usage.listUsage.mockReset().mockResolvedValue([]);
  usage.summarizeUsage.mockReset().mockReturnValue(emptyUsage);
});

describe("GET / (board)", () => {
  it("includes a session field even when there are no rows", async () => {
    store.listCharts.mockResolvedValue([]);
    const app = await testApp();
    const res = await app.inject("/");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(["pre", "regular", "post", "overnight"]).toContain(body.data.session);
    expect(body.data.rows).toEqual([]);
  });

  it("returns rows with the session field for today's intraday charts", async () => {
    store.listCharts.mockResolvedValue([makeMeta()]);
    store.loadChart.mockResolvedValue(makeDoc());
    provider.getQuotes.mockResolvedValue([
      { symbol: "MU.US", last: "110", prev_close: "108", change_percentage: "1.8" },
    ]);
    comments.listComments.mockResolvedValue([]);
    const app = await testApp();
    const res = await app.inject("/");
    const body = res.json();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].symbol).toBe("MU.US");
    expect(["pre", "regular", "post", "overnight"]).toContain(body.data.session);
  });
});

describe("GET /recap", () => {
  it("returns empty settlements plus usage when nothing was tracked today", async () => {
    store.listCharts.mockResolvedValue([]);
    const app = await testApp();
    const res = await app.inject("/recap");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.settlements).toEqual([]);
    expect(body.data.alerts).toEqual([]);
    expect(body.data.usage).toEqual(emptyUsage);
  });

  it("settles today's symbols with outcome, day pct and alert list", async () => {
    store.listCharts.mockResolvedValue([makeMeta()]);
    store.loadChart.mockResolvedValue(makeDoc());
    provider.getQuotes.mockResolvedValue([
      { symbol: "MU.US", last: "121", prev_close: "108", change_percentage: "12.0" },
    ]);
    provider.getKline.mockResolvedValue([
      { time: new Date().toISOString(), open: 100, high: 122, low: 99, close: 121, volume: 1000 },
    ]);
    comments.listComments.mockResolvedValue([
      { ts: "2026-07-05T14:00:00Z", symbol: "MU.US", level: "alert", text: "接近目标", source: "commentator" },
      { ts: "2026-07-05T13:00:00Z", symbol: "MU.US", level: "info", text: "正常", source: "commentator" },
    ]);
    const app = await testApp();
    const res = await app.inject("/recap");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const [row] = body.data.settlements;
    expect(row.symbol).toBe("MU.US");
    expect(row.direction).toBe("long");
    expect(row.day_pct).toBeCloseTo(12.0);
    expect(row.outcome.status).toBe("hit_target");
    expect(body.data.alerts).toHaveLength(1);
    expect(body.data.alerts[0].level).toBe("alert");
  });

  it("serves the cached recap within the TTL without re-hitting the provider", async () => {
    store.listCharts.mockResolvedValue([makeMeta()]);
    store.loadChart.mockResolvedValue(makeDoc());
    provider.getQuotes.mockResolvedValue([
      { symbol: "MU.US", last: "121", prev_close: "108", change_percentage: "12.0" },
    ]);
    provider.getKline.mockResolvedValue([]);
    comments.listComments.mockResolvedValue([]);
    const app = await testApp();
    await app.inject("/recap");
    await app.inject("/recap");
    expect(provider.getQuotes).toHaveBeenCalledTimes(1);
  });
});
