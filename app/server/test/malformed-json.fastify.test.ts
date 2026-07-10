import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { ClientError } from "../src/errors.js";
import { chartsRoute } from "../src/routes/charts.js";

// Registers the exact FST_ERR_CTP* error-handler branch from src/app.ts (not
// the full app — booting the full app requires initAiSettings()/getDb() side
// effects unrelated to this capture) to observe real Fastify content-type
// parsing behavior for a malformed JSON POST. This is the value the Tsuki
// AppExceptionFilter's malformed-JSON branch must byte-match.
describe("Fastify malformed JSON body (capture for Tsuki parity)", () => {
  it("returns the FST_ERR_CTP* envelope this repo's Tsuki exception filter must replicate byte-for-byte", async () => {
    const app = Fastify();
    app.setErrorHandler((err, _req, reply) => {
      if (err instanceof ClientError) {
        return reply.status(err.status).send({ ok: false, error: err.message, hint: err.hint });
      }
      if (err instanceof Error && "code" in err && String(err.code).startsWith("FST_ERR_CTP")) {
        return reply.status(400).send({
          ok: false,
          error: "request body must be JSON",
          hint: 'e.g. {"type": "sepa", "symbol": "MRVL.US"}',
        });
      }
      console.error(err);
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
    await app.register(chartsRoute, { prefix: "/api/charts" });

    const res = await app.inject({
      method: "POST",
      url: "/api/charts",
      headers: { "content-type": "application/json" },
      payload: "{not valid json",
    });
    expect(res.statusCode).toBe(400);
    // keep in sync by hand with src/app.ts:24-34's FST_ERR_CTP* handler
    expect(res.json()).toEqual({
      ok: false,
      error: "request body must be JSON",
      hint: 'e.g. {"type": "sepa", "symbol": "MRVL.US"}',
    });
    await app.close();
  });
});
