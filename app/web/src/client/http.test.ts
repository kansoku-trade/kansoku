import { afterEach, describe, expect, it, vi } from "vitest";
import { allRoutes } from "../../../packages/core/src/contract/index.js";
import { ApiError } from "../api";
import { getRestrictedModeSnapshotForTests, resetRestrictedModeForTests } from "../restrictedMode";
import { createHttpClient } from "./http";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createHttpClient", () => {
  afterEach(() => {
    resetRestrictedModeForTests();
    vi.unstubAllGlobals();
  });

  it("substitutes path params and drops them from the query", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonResponse({ ok: true, data: { id: "abc" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await client.charts.get({ id: "abc" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/charts/abc");
  });

  it("builds a query string from leftover input, skipping undefined values", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonResponse({ ok: true, data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await client.charts.list({ type: "flow,cohort", symbol: undefined, limit: 5, stale: true });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/charts?type=flow%2Ccohort&limit=5&stale=true");
  });

  it("sends a JSON body for POST/PATCH/PUT with the remaining fields", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonResponse({ ok: true, data: { id: "x" }, meta: { created: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await client.charts.create({ type: "sepa", symbol: "MRVL.US" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/charts");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ type: "sepa", symbol: "MRVL.US" });
  });

  it("routes LobeHub provider operations outside the settings namespace", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) =>
      jsonResponse({ ok: true, data: { status: "disconnected" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await client.lobehub.getAccount();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/providers/lobehub/account");
  });

  it("reads the current AI analysis run state from the symbol status route", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) =>
      jsonResponse({ ok: true, data: { running: true, startedAt: "2026-07-14T02:03:04.000Z" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    const status = await client.symbols.reassessStatus({ sym: "MU" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/symbols/MU/reassess/status");
    expect(status).toEqual({ running: true, startedAt: "2026-07-14T02:03:04.000Z" });
  });

  it("reassembles {data, meta} for withMeta routes", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonResponse({ ok: true, data: { id: "x" }, meta: { created: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    const result = await client.charts.create({ type: "sepa" });
    expect(result).toEqual({ data: { id: "x" }, meta: { created: true } });
  });

  it("does not wrap the result for non-withMeta routes", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonResponse({ ok: true, data: [{ id: "a" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    const result = await client.charts.list();
    expect(result).toEqual([{ id: "a" }]);
  });

  it("throws ApiError on an ok:false envelope and marks restricted mode on a credentials 503", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: false, error: "not configured", code: "NO_CREDENTIALS" }, 503),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await expect(client.positions.list()).rejects.toThrow(ApiError);
    expect(getRestrictedModeSnapshotForTests().restricted).toBe(true);
  });

  it("does not mark restricted mode for an unrelated error", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonResponse({ ok: false, error: "not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await expect(client.charts.get({ id: "x" })).rejects.toThrow(ApiError);
    expect(getRestrictedModeSnapshotForTests().restricted).toBe(false);
  });

  it("throws on a malformed envelope", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => jsonResponse({ not: "an envelope" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await expect(client.positions.list()).rejects.toThrow(ApiError);
  });

  it("throws on invalid JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("not json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await expect(client.positions.list()).rejects.toThrow(ApiError);
  });

  it('returns the JSON body as-is for raw:"body" routes, with no envelope unwrap', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ session: null, messages: [], busy: false, partial: null }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    const result = await client.chat.get({ id: "abc" });
    expect(result).toEqual({ session: null, messages: [], busy: false, partial: null });
  });

  it('throws ApiError on non-2xx for raw:"body" routes', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ markdown: null }, 404));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    await expect(client.symbols.note({ sym: "MRVL" })).rejects.toThrow(ApiError);
  });

  it('returns { status, body } for raw:"statusBody" routes on success', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ accepted: true }, 202));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    const result = await client.chat.postMessage({ id: "abc", text: "hi" });
    expect(result).toEqual({ status: 202, body: { accepted: true } });
  });

  it('returns { status, body } without throwing for raw:"statusBody" routes on non-2xx', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "busy" }, 409));
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient(allRoutes);

    const result = await client.chat.postMessage({ id: "abc", text: "hi" });
    expect(result).toEqual({ status: 409, body: { error: "busy" } });
  });
});
