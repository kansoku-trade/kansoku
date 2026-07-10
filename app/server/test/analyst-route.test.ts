import { beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => ({ aiConfig: vi.fn() }));
const analyst = vi.hoisted(() => ({ runAnalyst: vi.fn() }));

vi.mock("../src/ai/models.js", () => models);
vi.mock("../src/ai/analyst.js", () => analyst);

const { tsukiRequest } = await import("./helpers.js");

describe("POST /:sym/reassess", () => {
  beforeEach(() => {
    models.aiConfig.mockReset();
    analyst.runAnalyst.mockReset();
  });

  it("returns started:false when the analyst layer is disabled", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: null });
    const res = await tsukiRequest("/api/symbols/MU/reassess", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { started: false, reason: "analyst layer disabled" } });
    expect(analyst.runAnalyst).not.toHaveBeenCalled();
  });

  it("starts a manual run and returns started:true", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: { id: "m" } });
    analyst.runAnalyst.mockReturnValue({ started: true, done: Promise.resolve() });
    const res = await tsukiRequest("/api/symbols/MU/reassess", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true, data: { started: true } });
    expect(analyst.runAnalyst).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "MU.US", origin: "manual" }),
    );
  });

  it("surfaces started:false with the reason when a run is already in flight", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: { id: "m" } });
    analyst.runAnalyst.mockReturnValue({ started: false, reason: "already running" });
    const res = await tsukiRequest("/api/symbols/MU/reassess", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true, data: { started: false, reason: "already running" } });
  });
});
