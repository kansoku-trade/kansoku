import { promises as fs } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? "/tmp/";
  const sep = base.endsWith("/") ? "" : "/";
  const dir = `${base}${sep}symbols-note-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock("../src/env.js", () => ({ STOCKS_DIR: ctx.dir }));

const { tsukiRequest } = await import("./helpers.js");

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

describe("GET /:sym/note", () => {
  it("returns the markdown and mtime for an existing note", async () => {
    await fs.mkdir(ctx.dir, { recursive: true });
    await fs.writeFile(join(ctx.dir, "MRVL.md"), "# MRVL notes");
    const res = await tsukiRequest("/api/symbols/MRVL.US/note");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markdown).toBe("# MRVL notes");
    expect(new Date(body.mtime).toString()).not.toBe("Invalid Date");
  });

  it("strips the .US suffix case-insensitively", async () => {
    await fs.mkdir(ctx.dir, { recursive: true });
    await fs.writeFile(join(ctx.dir, "NVDA.md"), "# NVDA notes");
    const res = await tsukiRequest("/api/symbols/nvda.us/note");
    expect(res.status).toBe(200);
    expect((await res.json()).markdown).toBe("# NVDA notes");
  });

  it("returns markdown: null when the note file does not exist", async () => {
    const res = await tsukiRequest("/api/symbols/ZZZZ.US/note");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ markdown: null });
  });

  it("rejects a traversal attempt with 400", async () => {
    const res = await tsukiRequest("/api/symbols/..%2F..%2Fetc%2Fpasswd/note");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
