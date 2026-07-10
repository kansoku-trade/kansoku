import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartDoc, ChartMeta } from "../../shared/types.js";
import { tsukiRequest } from "./helpers.js";

const store = vi.hoisted(() => ({
  listCharts: vi.fn(),
  loadChart: vi.fn(),
  saveChart: vi.fn(),
  allocateId: vi.fn(),
  createChart: vi.fn(),
  deleteChart: vi.fn(),
}));

const build = vi.hoisted(() => ({
  ALL_TYPES: ["flow", "cohort", "sepa", "intraday"],
  buildChart: vi.fn(),
  mergeForPatch: vi.fn((_type: string, input: Record<string, unknown>, body: Record<string, unknown>) => ({
    ...input,
    ...body,
  })),
  rebuild: vi.fn(),
  refreshBody: vi.fn((): Record<string, unknown> | null => null),
}));

vi.mock("../src/services/store.js", () => store);
vi.mock("../src/services/build.js", () => build);

function patchReq(id: string, payload: unknown): [string, RequestInit] {
  return [
    `/api/charts/${id}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  ];
}

function postReq(payload: unknown): [string, RequestInit] {
  return [
    "/api/charts",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  ];
}

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
  store.createChart.mockReset();
  build.mergeForPatch.mockClear();
  build.rebuild.mockReset();
  build.refreshBody.mockReset().mockReturnValue(null);
  build.buildChart.mockReset();
});

function freezeAt(ts: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(ts));
}

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
    freezeAt(REGULAR_TS);

    const res = await tsukiRequest(...patchReq(doc.id, { prediction: { direction: "short" } }));
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
    freezeAt(REGULAR_TS);

    await tsukiRequest(...patchReq(doc.id, { prediction: null }));
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

    await tsukiRequest(...patchReq(doc.id, { title: "new title" }));
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

    await tsukiRequest(...patchReq(doc.id, { position: { shares: 1 } }));
    const saved = store.saveChart.mock.calls[0][0] as ChartDoc;
    expect(saved.prediction_updated_at).toBeUndefined();
  });
});

describe("POST /", () => {
  it("hands the build result to store.createChart and returns the persisted doc", async () => {
    const buildResult = {
      type: "intraday",
      title: "NVDA 短线多周期",
      slug: "nvda-intraday",
      symbol: "NVDA.US",
      sessionDate: "2026-07-05",
      input: { symbol: "NVDA.US", context: { generated_at: "2026-07-05T14:00:00.000Z" } },
      built: { kind: "intraday" },
      meta: {},
    };
    build.buildChart.mockResolvedValue(buildResult);
    store.createChart.mockResolvedValue(makeDoc({ id: "2026-07-05-nvda-intraday", schema_version: 2 }));

    const res = await tsukiRequest(...postReq({ type: "intraday", symbol: "NVDA.US" }));
    expect(res.status).toBe(200);
    expect(store.createChart.mock.calls[0][0]).toEqual(buildResult);
    const body = await res.json();
    expect(body.data.id).toBe("2026-07-05-nvda-intraday");
  });
});

describe("PATCH /:id context", () => {
  it("merges a context payload passed via mergeForPatch into the saved input", async () => {
    const context = {
      generated_at: "2026-07-05T14:00:00.000Z",
      conclusion: { stance: "long", summary: "多头结构未破坏", action: "回踩不破前低可加仓" },
      news: [],
      sources_used: ["longbridge-news"],
    };
    const doc = makeDoc({ input: { symbol: "NVDA.US", prediction: null, context: null } });
    store.loadChart.mockResolvedValue(doc);
    build.mergeForPatch.mockReturnValueOnce({ ...doc.input, context });
    build.rebuild.mockReturnValue({
      type: "intraday",
      title: doc.title,
      symbol: doc.symbol,
      input: { ...doc.input, context },
      built: doc.built,
      meta: {},
    });

    await tsukiRequest(...patchReq(doc.id, { context }));
    const saved = store.saveChart.mock.calls[0][0] as ChartDoc;
    expect(saved.input.context).toEqual(context);
  });

  it("leaves context untouched on a PATCH that omits it", async () => {
    const context = {
      generated_at: "2026-07-05T14:00:00.000Z",
      conclusion: { stance: "long", summary: "x", action: "y" },
      news: [],
      sources_used: [],
    };
    const doc = makeDoc({ input: { symbol: "NVDA.US", prediction: null, context } });
    store.loadChart.mockResolvedValue(doc);
    build.mergeForPatch.mockReturnValueOnce({ ...doc.input });
    build.rebuild.mockReturnValue({
      type: "intraday",
      title: "new title",
      symbol: doc.symbol,
      input: doc.input,
      built: doc.built,
      meta: {},
    });

    await tsukiRequest(...patchReq(doc.id, { title: "new title" }));
    const saved = store.saveChart.mock.calls[0][0] as ChartDoc;
    expect(saved.input.context).toEqual(context);
  });
});

describe("PATCH /:id legacy type guard", () => {
  it("rejects PATCH on a persisted doc whose type is no longer supported", async () => {
    const doc = makeDoc({ type: "kline" as ChartDoc["type"] });
    store.loadChart.mockResolvedValue(doc);

    const res = await tsukiRequest(...patchReq(doc.id, { title: "new title" }));
    expect(res.status).toBe(400);
    expect(store.saveChart).not.toHaveBeenCalled();
  });
});

describe("GET /:id backward compat with v1 docs", () => {
  it("loads and renders a v1 doc whose input has no context key at all", async () => {
    const doc = makeDoc({ schema_version: 1, input: { symbol: "NVDA.US", prediction: null } });
    store.loadChart.mockResolvedValue(doc);

    const res = await tsukiRequest(`/api/charts/${doc.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.schema_version).toBe(1);
    expect(body.data.prediction_stale).toBe(false);
  });
});

describe("GET /:id computed prediction_stale", () => {
  it("carries prediction_updated_at and computed prediction_stale", async () => {
    freezeAt(REGULAR_TS);
    const staleAt = new Date(new Date(REGULAR_TS).getTime() - 16 * 60_000).toISOString();
    const doc = makeDoc({ prediction_updated_at: staleAt });
    store.loadChart.mockResolvedValue(doc);

    const res = await tsukiRequest(`/api/charts/${doc.id}`);
    const body = await res.json();
    expect(body.data.prediction_updated_at).toBe(staleAt);
    expect(body.data.prediction_stale).toBe(true);
    vi.useRealTimers();
  });
});

describe("GET / list staleness exposure and filtering", () => {
  it("exposes prediction_updated_at and prediction_stale on each meta", async () => {
    freezeAt(REGULAR_TS);
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

    const res = await tsukiRequest("/api/charts");
    const body = await res.json();
    const byId = Object.fromEntries(body.data.map((m: { id: string }) => [m.id, m]));
    expect(byId["stale-chart"].prediction_stale).toBe(true);
    expect(byId["stale-chart"].prediction_updated_at).toBe(staleAt);
    expect(byId["fresh-chart"].prediction_stale).toBe(false);
    expect(byId["sepa-chart"].prediction_stale).toBe(false);
    vi.useRealTimers();
  });

  it("?stale=true returns only currently-stale charts", async () => {
    freezeAt(REGULAR_TS);
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

    const res = await tsukiRequest("/api/charts?stale=true");
    const body = await res.json();
    expect(body.data.map((m: { id: string }) => m.id)).toEqual(["stale-chart"]);
    vi.useRealTimers();
  });
});

describe("GET / type filtering", () => {
  it("splits a comma-separated ?type= into an array passed to listCharts", async () => {
    store.listCharts.mockResolvedValue([]);
    await tsukiRequest("/api/charts?type=flow,cohort");
    expect(store.listCharts).toHaveBeenCalledWith(expect.objectContaining({ type: ["flow", "cohort"] }));
  });

  it("passes a single ?type= through as a one-element array", async () => {
    store.listCharts.mockResolvedValue([]);
    await tsukiRequest("/api/charts?type=sepa");
    expect(store.listCharts).toHaveBeenCalledWith(expect.objectContaining({ type: ["sepa"] }));
  });

  it("omits type entirely when not provided", async () => {
    store.listCharts.mockResolvedValue([]);
    await tsukiRequest("/api/charts");
    expect(store.listCharts).toHaveBeenCalledWith(expect.objectContaining({ type: undefined }));
  });
});

describe("GET /:id/built", () => {
  it("rebuilds ephemerally with the requested count and never saves", async () => {
    const doc = makeDoc();
    store.loadChart.mockResolvedValue(doc);
    build.refreshBody.mockReturnValue({ type: "intraday", symbol: doc.symbol, session: "intraday" });
    build.buildChart.mockResolvedValue({ built: { kind: "intraday" }, meta: {} });

    const res = await tsukiRequest(`/api/charts/${doc.id}/built?count=300`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.count).toBe(300);
    expect(build.buildChart).toHaveBeenCalledWith(
      expect.objectContaining({ type: "intraday", symbol: doc.symbol, count: 300, title: doc.title }),
    );
    expect(store.saveChart).not.toHaveBeenCalled();
  });

  it("clamps count to 1000", async () => {
    const doc = makeDoc();
    store.loadChart.mockResolvedValue(doc);
    build.refreshBody.mockReturnValue({ type: "intraday", symbol: doc.symbol });
    build.buildChart.mockResolvedValue({ built: { kind: "intraday" }, meta: {} });

    const res = await tsukiRequest(`/api/charts/${doc.id}/built?count=5000`);
    const body = await res.json();
    expect(body.data.count).toBe(1000);
    expect(build.buildChart).toHaveBeenCalledWith(expect.objectContaining({ count: 1000 }));
  });

  it("rejects missing or invalid count", async () => {
    const doc = makeDoc();
    store.loadChart.mockResolvedValue(doc);
    expect((await tsukiRequest(`/api/charts/${doc.id}/built`)).status).toBe(400);
    expect((await tsukiRequest(`/api/charts/${doc.id}/built?count=abc`)).status).toBe(400);
    expect((await tsukiRequest(`/api/charts/${doc.id}/built?count=-3`)).status).toBe(400);
  });

  it("rejects non-intraday charts", async () => {
    store.loadChart.mockResolvedValue(makeDoc({ type: "flow" }));
    const res = await tsukiRequest("/api/charts/some-flow/built?count=300");
    expect(res.status).toBe(400);
  });

  it("404s on unknown chart", async () => {
    store.loadChart.mockResolvedValue(null);
    const res = await tsukiRequest("/api/charts/nope/built?count=300");
    expect(res.status).toBe(404);
  });
});

describe("malformed JSON body", () => {
  it("matches Fastify's FST_ERR_CTP* envelope byte-for-byte", async () => {
    const res = await tsukiRequest("/api/charts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    // captured from `createApp()` (Fastify) POSTing the same malformed body to
    // /api/charts — see test/malformed-json.fastify.test.ts for the capture.
    // keep in sync by hand with src/app.ts:24-34's FST_ERR_CTP* handler
    expect(body).toEqual({
      ok: false,
      error: "request body must be JSON",
      hint: 'e.g. {"type": "sepa", "symbol": "MRVL.US"}',
    });
  });
});
