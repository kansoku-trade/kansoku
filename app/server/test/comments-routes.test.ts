import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CockpitComment } from "../../shared/types.js";

const comments = vi.hoisted(() => ({
  listComments: vi.fn(),
  onComment: vi.fn(),
  appendComment: vi.fn(),
}));

vi.mock("../src/ai/comments.js", () => comments);

const { symbolsRoute } = await import("../src/routes/symbols.js");
const { ClientError } = await import("../src/errors.js");
const { easternDate } = await import("../src/services/session.js");

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

function comment(overrides: Partial<CockpitComment> = {}): CockpitComment {
  return {
    ts: "2026-07-02T15:00:00.000Z",
    symbol: "MU.US",
    level: "info",
    text: "hi",
    source: "commentator",
    ...overrides,
  };
}

beforeEach(() => {
  comments.listComments.mockReset();
  comments.listComments.mockResolvedValue([]);
});

describe("GET /:sym/comments", () => {
  it("defaults date to today's US-Eastern date and normalizes the symbol", async () => {
    const app = await testApp();
    const res = await app.inject({ method: "GET", url: "/mu/comments" });
    expect(res.statusCode).toBe(200);
    expect(comments.listComments).toHaveBeenCalledWith("MU.US", easternDate());
  });

  it("honors an explicit date and returns the stored list", async () => {
    comments.listComments.mockResolvedValue([comment()]);
    const app = await testApp();
    const res = await app.inject({ method: "GET", url: "/MU.US/comments?date=2026-07-01" });
    expect(res.statusCode).toBe(200);
    expect(comments.listComments).toHaveBeenCalledWith("MU.US", "2026-07-01");
    expect(res.json().data).toHaveLength(1);
  });

  it("returns an empty list when there is no file for the date", async () => {
    const app = await testApp();
    const res = await app.inject({ method: "GET", url: "/MU.US/comments?date=2026-07-03" });
    expect(res.json()).toEqual({ ok: true, data: [] });
  });

  it("rejects a malformed date", async () => {
    const app = await testApp();
    const res = await app.inject({ method: "GET", url: "/MU.US/comments?date=../evil" });
    expect(res.statusCode).toBe(400);
    expect(comments.listComments).not.toHaveBeenCalled();
  });
});
