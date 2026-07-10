import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartDoc, ChartMeta } from "../../shared/types.js";
import { tsukiRequest } from "./helpers.js";

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
  listAllCommentDates: vi.fn(),
}));

const usage = vi.hoisted(() => ({
  listUsage: vi.fn(),
  listUsageDates: vi.fn(),
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

const { resetOverviewCacheForTests } = await import("../src/modules/overview/overview.controller.js");
const { easternDate } = await import("../src/services/session.js");

const BASE = "/api/overview";

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
  resetOverviewCacheForTests();
  provider.getKline.mockReset();
  provider.getQuotes.mockReset();
  store.listCharts.mockReset();
  store.loadChart.mockReset();
  comments.listComments.mockReset();
  comments.listAllCommentDates.mockReset().mockResolvedValue([]);
  usage.listUsage.mockReset().mockResolvedValue([]);
  usage.listUsageDates.mockReset().mockResolvedValue([]);
  usage.summarizeUsage.mockReset().mockReturnValue(emptyUsage);
});

describe("GET / (board)", () => {
  it("includes a session field even when there are no rows", async () => {
    store.listCharts.mockResolvedValue([]);
    const res = await tsukiRequest(BASE);
    expect(res.status).toBe(200);
    const body = await res.json();
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
    const res = await tsukiRequest(BASE);
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].symbol).toBe("MU.US");
    expect(["pre", "regular", "post", "overnight"]).toContain(body.data.session);
  });
});

describe("GET /recap", () => {
  it("returns empty settlements plus usage when nothing was tracked today", async () => {
    store.listCharts.mockResolvedValue([]);
    const res = await tsukiRequest(`${BASE}/recap`);
    expect(res.status).toBe(200);
    const body = await res.json();
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
    const res = await tsukiRequest(`${BASE}/recap`);
    expect(res.status).toBe(200);
    const body = await res.json();
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
    await tsukiRequest(`${BASE}/recap`);
    await tsukiRequest(`${BASE}/recap`);
    expect(provider.getQuotes).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed date querystring", async () => {
    const res = await tsukiRequest(`${BASE}/recap?date=07-05-2026`);
    expect(res.status).toBe(400);
  });

  it("defaults to today when date is absent", async () => {
    store.listCharts.mockResolvedValue([]);
    const res = await tsukiRequest(`${BASE}/recap`);
    expect(res.status).toBe(200);
    expect((await res.json()).data.date).toBe(easternDate());
  });

  it("computes historical day_pct from daily bars without calling getQuotes", async () => {
    const histDate = "2026-07-01";
    store.listCharts.mockResolvedValue([
      makeMeta({ id: `${histDate}-mu-intraday`, created_at: new Date(`${histDate}T14:00:00.000Z`).toISOString() }),
    ]);
    store.loadChart.mockResolvedValue(makeDoc());
    comments.listComments.mockResolvedValue([]);
    provider.getKline.mockImplementation((_symbol: string, period: string) => {
      if (period === "day") {
        return Promise.resolve([
          { time: "2026-06-29T20:00:00.000Z", open: 90, high: 95, low: 89, close: 90, volume: 100 },
          { time: "2026-06-30T20:00:00.000Z", open: 90, high: 100, low: 89, close: 100, volume: 100 },
          { time: "2026-07-01T20:00:00.000Z", open: 100, high: 112, low: 99, close: 110, volume: 100 },
        ]);
      }
      return Promise.resolve([]);
    });
    const res = await tsukiRequest(`${BASE}/recap?date=${histDate}`);
    expect(res.status).toBe(200);
    const [row] = (await res.json()).data.settlements;
    expect(row.day_pct).toBeCloseTo(10);
    expect(provider.getQuotes).not.toHaveBeenCalled();
  });

  it("returns null day_pct when the historical bar is missing", async () => {
    const histDate = "2026-06-15";
    store.listCharts.mockResolvedValue([
      makeMeta({ id: `${histDate}-mu-intraday`, created_at: new Date(`${histDate}T14:00:00.000Z`).toISOString() }),
    ]);
    store.loadChart.mockResolvedValue(makeDoc());
    comments.listComments.mockResolvedValue([]);
    provider.getKline.mockImplementation((_symbol: string, period: string) => {
      if (period === "day") {
        return Promise.resolve([
          { time: "2026-06-10T20:00:00.000Z", open: 90, high: 95, low: 89, close: 90, volume: 100 },
        ]);
      }
      return Promise.resolve([]);
    });
    const res = await tsukiRequest(`${BASE}/recap?date=${histDate}`);
    expect(res.status).toBe(200);
    const [row] = (await res.json()).data.settlements;
    expect(row.day_pct).toBeNull();
  });

  it("returns null day_pct when the historical kline fetch fails, without breaking the recap", async () => {
    const histDate = "2026-06-16";
    store.listCharts.mockResolvedValue([
      makeMeta({ id: `${histDate}-mu-intraday`, created_at: new Date(`${histDate}T14:00:00.000Z`).toISOString() }),
    ]);
    store.loadChart.mockResolvedValue(makeDoc());
    comments.listComments.mockResolvedValue([]);
    provider.getKline.mockImplementation((_symbol: string, period: string) => {
      if (period === "day") return Promise.reject(new Error("provider down"));
      return Promise.resolve([]);
    });
    const res = await tsukiRequest(`${BASE}/recap?date=${histDate}`);
    expect(res.status).toBe(200);
    const [row] = (await res.json()).data.settlements;
    expect(row.day_pct).toBeNull();
  });

  it("caches per date, so requesting date A does not serve date B's data", async () => {
    const dateA = "2026-06-01";
    const dateB = "2026-06-02";
    store.listCharts.mockImplementation(async () => [
      makeMeta({ id: `${dateA}-mu-intraday`, created_at: new Date(`${dateA}T14:00:00.000Z`).toISOString() }),
      makeMeta({ id: `${dateB}-nvda-intraday`, symbol: "NVDA.US", created_at: new Date(`${dateB}T14:00:00.000Z`).toISOString() }),
    ]);
    store.loadChart.mockResolvedValue(makeDoc());
    comments.listComments.mockResolvedValue([]);
    provider.getKline.mockResolvedValue([]);
    const resA = await tsukiRequest(`${BASE}/recap?date=${dateA}`);
    const resB = await tsukiRequest(`${BASE}/recap?date=${dateB}`);
    const bodyA = await resA.json();
    const bodyB = await resB.json();
    expect(bodyA.data.date).toBe(dateA);
    expect(bodyB.data.date).toBe(dateB);
    expect(bodyA.data.settlements[0].symbol).toBe("MU.US");
    expect(bodyB.data.settlements[0].symbol).toBe("NVDA.US");
  });
});

describe("GET /recap-dates", () => {
  it("unions usage, comment, and intraday-chart dates, deduped and sorted descending", async () => {
    usage.listUsageDates.mockResolvedValue(["2026-07-05", "2026-07-03"]);
    comments.listAllCommentDates.mockResolvedValue(["2026-07-06", "2026-07-03"]);
    store.listCharts.mockResolvedValue([
      makeMeta({ id: "2026-07-01-mu-intraday", created_at: new Date("2026-07-01T14:00:00.000Z").toISOString() }),
      makeMeta({ id: "2026-07-06-nvda-intraday", symbol: "NVDA.US", created_at: new Date("2026-07-06T14:00:00.000Z").toISOString() }),
    ]);
    const res = await tsukiRequest(`${BASE}/recap-dates`);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(["2026-07-06", "2026-07-05", "2026-07-03", "2026-07-01"]);
  });

  it("returns an empty list when there is no data in any source", async () => {
    store.listCharts.mockResolvedValue([]);
    const res = await tsukiRequest(`${BASE}/recap-dates`);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});
