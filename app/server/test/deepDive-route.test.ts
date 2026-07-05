import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deepDive = vi.hoisted(() => ({ startDeepDive: vi.fn(), deepDiveState: vi.fn() }));

vi.mock("../src/ai/deepDive.js", () => deepDive);

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

describe("POST /:sym/deep-dive", () => {
  beforeEach(() => {
    deepDive.startDeepDive.mockReset();
    deepDive.deepDiveState.mockReset();
  });

  it("returns 202 when the run starts", async () => {
    deepDive.startDeepDive.mockReturnValue({ started: true });
    const app = await testApp();
    const res = await app.inject({ method: "POST", url: "/MU/deep-dive" });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(deepDive.startDeepDive).toHaveBeenCalledWith("MU");
  });

  it("returns 409 when a run is already busy", async () => {
    deepDive.startDeepDive.mockReturnValue({ started: false, reason: "busy" });
    const app = await testApp();
    const res = await app.inject({ method: "POST", url: "/MU/deep-dive" });
    expect(res.statusCode).toBe(409);
    expect(res.json().ok).toBe(false);
  });

  it("returns 503 when disabled", async () => {
    deepDive.startDeepDive.mockReturnValue({ started: false, reason: "disabled" });
    const app = await testApp();
    const res = await app.inject({ method: "POST", url: "/MU/deep-dive" });
    expect(res.statusCode).toBe(503);
    expect(res.json().ok).toBe(false);
  });
});

describe("GET /:sym/deep-dive/status", () => {
  it("returns the current deep dive state", async () => {
    deepDive.deepDiveState.mockReturnValue({ running: true, symbol: "MU" });
    const app = await testApp();
    const res = await app.inject({ method: "GET", url: "/MU/deep-dive/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ running: true, symbol: "MU" });
  });
});
