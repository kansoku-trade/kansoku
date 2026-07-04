import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const models = vi.hoisted(() => ({ aiConfig: vi.fn() }));
const analyst = vi.hoisted(() => ({ runAnalyst: vi.fn() }));

vi.mock("../src/ai/models.js", () => models);
vi.mock("../src/ai/analyst.js", () => analyst);

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

describe("POST /:sym/reassess", () => {
  beforeEach(() => {
    models.aiConfig.mockReset();
    analyst.runAnalyst.mockReset();
  });

  it("returns started:false when the analyst layer is disabled", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: null });
    const app = await testApp();
    const res = await app.inject({ method: "POST", url: "/MU/reassess" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, data: { started: false, reason: "analyst layer disabled" } });
    expect(analyst.runAnalyst).not.toHaveBeenCalled();
  });

  it("starts a manual run and returns started:true", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: { id: "m" } });
    analyst.runAnalyst.mockReturnValue({ started: true, done: Promise.resolve() });
    const app = await testApp();
    const res = await app.inject({ method: "POST", url: "/MU/reassess" });
    expect(res.json()).toEqual({ ok: true, data: { started: true } });
    expect(analyst.runAnalyst).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "MU.US", origin: "manual" }),
    );
  });

  it("surfaces started:false with the reason when a run is already in flight", async () => {
    models.aiConfig.mockReturnValue({ commentModel: null, analystModel: { id: "m" } });
    analyst.runAnalyst.mockReturnValue({ started: false, reason: "already running" });
    const app = await testApp();
    const res = await app.inject({ method: "POST", url: "/MU/reassess" });
    expect(res.json()).toEqual({ ok: true, data: { started: false, reason: "already running" } });
  });
});
