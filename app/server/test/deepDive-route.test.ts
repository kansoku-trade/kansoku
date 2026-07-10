import { beforeEach, describe, expect, it, vi } from "vitest";

const deepDive = vi.hoisted(() => ({ startDeepDive: vi.fn(), deepDiveState: vi.fn() }));

vi.mock("../src/ai/deepDive.js", () => deepDive);

const { tsukiRequest } = await import("./helpers.js");

describe("POST /:sym/deep-dive", () => {
  beforeEach(() => {
    deepDive.startDeepDive.mockReset();
    deepDive.deepDiveState.mockReset();
  });

  it("returns 202 when the run starts", async () => {
    deepDive.startDeepDive.mockReturnValue({ started: true });
    const res = await tsukiRequest("/api/symbols/MU/deep-dive", { method: "POST" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect(deepDive.startDeepDive).toHaveBeenCalledWith("MU");
  });

  it("returns 409 when a run is already busy", async () => {
    deepDive.startDeepDive.mockReturnValue({ started: false, reason: "busy" });
    const res = await tsukiRequest("/api/symbols/MU/deep-dive", { method: "POST" });
    expect(res.status).toBe(409);
    expect((await res.json()).ok).toBe(false);
  });

  it("returns 503 when disabled", async () => {
    deepDive.startDeepDive.mockReturnValue({ started: false, reason: "disabled" });
    const res = await tsukiRequest("/api/symbols/MU/deep-dive", { method: "POST" });
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });
});

describe("GET /:sym/deep-dive/status", () => {
  it("returns the current deep dive state", async () => {
    deepDive.deepDiveState.mockReturnValue({ running: true, symbol: "MU" });
    const res = await tsukiRequest("/api/symbols/MU/deep-dive/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ running: true, symbol: "MU" });
  });
});
