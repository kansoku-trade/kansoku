import { promises as fs } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? "/tmp/";
  const sep = base.endsWith("/") ? "" : "/";
  const dir = `${base}${sep}symbols-note-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock("../src/env.js", () => ({ STOCKS_DIR: ctx.dir }));

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

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

describe("GET /:sym/note", () => {
  it("returns the markdown and mtime for an existing note", async () => {
    await fs.mkdir(ctx.dir, { recursive: true });
    await fs.writeFile(join(ctx.dir, "MRVL.md"), "# MRVL notes");
    const app = await testApp();
    const res = await app.inject("/MRVL.US/note");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.markdown).toBe("# MRVL notes");
    expect(new Date(body.mtime).toString()).not.toBe("Invalid Date");
  });

  it("strips the .US suffix case-insensitively", async () => {
    await fs.mkdir(ctx.dir, { recursive: true });
    await fs.writeFile(join(ctx.dir, "NVDA.md"), "# NVDA notes");
    const app = await testApp();
    const res = await app.inject("/nvda.us/note");
    expect(res.statusCode).toBe(200);
    expect(res.json().markdown).toBe("# NVDA notes");
  });

  it("returns markdown: null when the note file does not exist", async () => {
    const app = await testApp();
    const res = await app.inject("/ZZZZ.US/note");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ markdown: null });
  });

  it("rejects a traversal attempt with 400", async () => {
    const app = await testApp();
    const res = await app.inject("/..%2F..%2Fetc%2Fpasswd/note");
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.ok).toBe(false);
  });
});
