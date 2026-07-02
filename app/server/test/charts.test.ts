import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartDoc, ChartMeta } from "../../shared/types.js";

const store = vi.hoisted(() => ({
  listCharts: vi.fn(),
  loadChart: vi.fn(),
  saveChart: vi.fn(),
  allocateId: vi.fn(),
  deleteChart: vi.fn(),
}));

const build = vi.hoisted(() => ({
  buildChart: vi.fn(),
  mergeForPatch: vi.fn((_type: string, input: Record<string, unknown>, body: Record<string, unknown>) => ({
    ...input,
    ...body,
  })),
  rebuild: vi.fn(),
  refreshBody: vi.fn(() => null),
}));

vi.mock("../src/services/store.js", () => store);
vi.mock("../src/services/build.js", () => build);

const { chartsRoute } = await import("../src/routes/charts.js");

const REGULAR_TS = "2026-07-02T15:00:00.000Z";

function makeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id: "2026-07-02-nvda-intraday",
    schema_version: 1,
    type: "intraday",
    title: "NVDA 短线多周期",
    symbol: "NVDA.US",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    input: { symbol: "NVDA.US", prediction: { direction: "long" } },
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
    ...overrides,
  };
}

function makeMeta(overrides: Partial<ChartMeta> = {}): ChartMeta {
  return {
    id: "2026-07-02-nvda-intraday",
    schema_version: 1,
    type: "intraday",
    title: "NVDA 短线多周期",
    symbol: "NVDA.US",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  store.listCharts.mockReset();
  store.loadChart.mockReset();
  store.saveChart.mockReset();
  build.mergeForPatch.mockClear();
  build.rebuild.mockReset();
  build.refreshBody.mockReset().mockReturnValue(null);
  build.buildChart.mockReset();
});

describe("PATCH /:id prediction_updated_at", () => {
  it("sets prediction_updated_at when body explicitly contains a prediction key", async () => {
    const doc = makeDoc({ prediction_updated_at: undefined });
    store.loadChart.mockResolvedValue(doc);
    build.rebuild.mockReturnValue({
      type: "intraday",
      title: doc.title,
      symbol: doc.symbol,
      input: { ...doc.input, prediction: { direction: "short" } },
      built: doc.built,
      meta: {},
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(REGULAR_TS));

    const res = await chartsRoute.request(`/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prediction: { direction: "short" } }),
    });
    expect(res.status).toBe(200);
    expect(store.saveChart).toHaveBeenCalledTimes(1);
    const saved = store.saveChart.mock.calls[0][0] as ChartDoc;
    expect(saved.prediction_updated_at).toBe(REGULAR_TS);
    vi.useRealTimers();
  });

  it("sets prediction_updated_at even when prediction value is explicitly null", async () => {
    const doc = makeDoc({ prediction_updated_at: undefined });
    store.loadChart.mockResolvedValue(doc);
    build.rebuild.mockReturnValue({
      type: "intraday",
      title: doc.title,
      symbol: doc.symbol,
      input: { ...doc.input, prediction: null },
      built: doc.built,
      meta: {},
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(REGULAR_TS));

    await chartsRoute.request(`/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prediction: null }),
    });
    const saved = store.saveChart.mock.calls[0][0] as ChartDoc;
    expect(saved.prediction_updated_at).toBe(REGULAR_TS);
    vi.useRealTimers();
  });

  it("leaves prediction_updated_at untouched on a PATCH without a prediction key", async () => {
    const doc = makeDoc({ prediction_updated_at: "2026-07-01T12:00:00.000Z" });
    store.loadChart.mockResolvedValue(doc);
    build.rebuild.mockReturnValue({
      type: "intraday",
      title: "new title",
      symbol: doc.symbol,
      input: doc.input,
      built: doc.built,
      meta: {},
    });

    await chartsRoute.request(`/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "new title" }),
    });
    const saved = store.saveChart.mock.calls[0][0] as ChartDoc;
    expect(saved.prediction_updated_at).toBe("2026-07-01T12:00:00.000Z");
  });

  it("leaves prediction_updated_at absent on a PATCH without a prediction key when never set", async () => {
    const doc = makeDoc({ prediction_updated_at: undefined });
    store.loadChart.mockResolvedValue(doc);
    build.rebuild.mockReturnValue({
      type: "intraday",
      title: doc.title,
      symbol: doc.symbol,
      input: doc.input,
      built: doc.built,
      meta: {},
    });

    await chartsRoute.request(`/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: { shares: 1 } }),
    });
    const saved = store.saveChart.mock.calls[0][0] as ChartDoc;
    expect(saved.prediction_updated_at).toBeUndefined();
  });
});

describe("GET /:id computed prediction_stale", () => {
  it("carries prediction_updated_at and computed prediction_stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(REGULAR_TS));
    const staleAt = new Date(new Date(REGULAR_TS).getTime() - 16 * 60_000).toISOString();
    const doc = makeDoc({ prediction_updated_at: staleAt });
    store.loadChart.mockResolvedValue(doc);

    const res = await chartsRoute.request(`/${doc.id}`);
    const body = await res.json();
    expect(body.data.prediction_updated_at).toBe(staleAt);
    expect(body.data.prediction_stale).toBe(true);
    vi.useRealTimers();
  });
});

describe("GET / list staleness exposure and filtering", () => {
  it("exposes prediction_updated_at and prediction_stale on each meta", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(REGULAR_TS));
    const staleAt = new Date(new Date(REGULAR_TS).getTime() - 16 * 60_000).toISOString();
    const freshAt = new Date(new Date(REGULAR_TS).getTime() - 5 * 60_000).toISOString();
    const staleMeta = makeMeta({ id: "stale-chart", prediction_updated_at: staleAt });
    const freshMeta = makeMeta({ id: "fresh-chart", prediction_updated_at: freshAt });
    const nonIntradayMeta = makeMeta({ id: "sepa-chart", type: "sepa" });
    store.listCharts.mockResolvedValue([staleMeta, freshMeta, nonIntradayMeta]);
    store.loadChart.mockImplementation(async (id: string) => {
      if (id === "stale-chart") return makeDoc({ id, prediction_updated_at: staleAt });
      if (id === "fresh-chart") return makeDoc({ id, prediction_updated_at: freshAt });
      return null;
    });

    const res = await chartsRoute.request("/");
    const body = await res.json();
    const byId = Object.fromEntries(body.data.map((m: { id: string }) => [m.id, m]));
    expect(byId["stale-chart"].prediction_stale).toBe(true);
    expect(byId["stale-chart"].prediction_updated_at).toBe(staleAt);
    expect(byId["fresh-chart"].prediction_stale).toBe(false);
    expect(byId["sepa-chart"].prediction_stale).toBe(false);
    vi.useRealTimers();
  });

  it("?stale=true returns only currently-stale charts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(REGULAR_TS));
    const staleAt = new Date(new Date(REGULAR_TS).getTime() - 16 * 60_000).toISOString();
    const freshAt = new Date(new Date(REGULAR_TS).getTime() - 5 * 60_000).toISOString();
    const staleMeta = makeMeta({ id: "stale-chart", prediction_updated_at: staleAt });
    const freshMeta = makeMeta({ id: "fresh-chart", prediction_updated_at: freshAt });
    store.listCharts.mockResolvedValue([staleMeta, freshMeta]);
    store.loadChart.mockImplementation(async (id: string) => {
      if (id === "stale-chart") return makeDoc({ id, prediction_updated_at: staleAt });
      if (id === "fresh-chart") return makeDoc({ id, prediction_updated_at: freshAt });
      return null;
    });

    const res = await chartsRoute.request("/?stale=true");
    const body = await res.json();
    expect(body.data.map((m: { id: string }) => m.id)).toEqual(["stale-chart"]);
    vi.useRealTimers();
  });
});
