import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "../../shared/types.js";

let annotationsDir: string;

vi.mock("../src/env.js", async () => {
  const actual = await vi.importActual<typeof import("../src/env.js")>("../src/env.js");
  return {
    ...actual,
    get ANNOTATIONS_DIR() {
      return annotationsDir;
    },
  };
});

const { annotationsRoute } = await import("../src/routes/annotations.js");
const { ClientError } = await import("../src/errors.js");

async function testApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ClientError) {
      return reply.status(err.status).send({ ok: false, error: err.message, hint: err.hint });
    }
    return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
  });
  await app.register(annotationsRoute);
  return app;
}

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "ann-1",
    kind: "trendline",
    points: [
      { time: 1700000000, price: 100 },
      { time: 1700000100, price: 110 },
    ],
    createdAt: 1700000000000,
    ...overrides,
  };
}

beforeEach(async () => {
  annotationsDir = await mkdtemp(join(tmpdir(), "annotations-test-"));
});

afterEach(async () => {
  await rm(annotationsDir, { recursive: true, force: true });
});

describe("GET /:symbol", () => {
  it("returns an empty array for an unknown symbol", async () => {
    const app = await testApp();
    const res = await app.inject("/NVDA.US");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, data: [] });
  });
});

describe("PUT /:symbol then GET", () => {
  it("round-trips a saved annotation list", async () => {
    const app = await testApp();
    const annotations = [
      makeAnnotation(),
      makeAnnotation({ id: "ann-2", kind: "hline", points: [{ time: 1700000000, price: 105 }] }),
    ];

    const putRes = await app.inject({ method: "PUT", url: "/NVDA.US", payload: { annotations } });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json()).toEqual({ ok: true, data: { count: 2 } });

    const getRes = await app.inject("/nvda.us");
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual({ ok: true, data: annotations });
  });
});

describe("PUT /:symbol validation", () => {
  it("rejects a body missing the annotations key", async () => {
    const app = await testApp();
    const res = await app.inject({ method: "PUT", url: "/NVDA.US", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
  });

  it("rejects an unknown annotation kind", async () => {
    const app = await testApp();
    const res = await app.inject({
      method: "PUT",
      url: "/NVDA.US",
      payload: { annotations: [makeAnnotation({ kind: "circle" as Annotation["kind"] })] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an hline annotation with 2 points", async () => {
    const app = await testApp();
    const res = await app.inject({
      method: "PUT",
      url: "/NVDA.US",
      payload: { annotations: [makeAnnotation({ kind: "hline" })] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /:symbol read error", () => {
  it("surfaces a 500 when the read fails for a reason other than a missing file", async () => {
    await mkdir(join(annotationsDir, "NVDA.US.json"));
    const app = await testApp();
    const res = await app.inject("/NVDA.US");
    expect(res.statusCode).toBe(500);
  });
});

describe("symbol path traversal", () => {
  it("rejects a symbol with a path traversal attempt", async () => {
    const app = await testApp();
    const res = await app.inject("/..%2Ffoo");
    expect(res.statusCode).toBe(400);
  });
});
