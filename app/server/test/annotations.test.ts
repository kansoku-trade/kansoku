import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const { tsukiRequest } = await import("./helpers.js");

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
    const res = await tsukiRequest("/api/annotations/NVDA.US");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: [] });
  });
});

describe("PUT /:symbol then GET", () => {
  it("round-trips a saved annotation list", async () => {
    const annotations = [
      makeAnnotation(),
      makeAnnotation({ id: "ann-2", kind: "hline", points: [{ time: 1700000000, price: 105 }] }),
    ];

    const putRes = await tsukiRequest("/api/annotations/NVDA.US", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annotations }),
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ ok: true, data: { count: 2 } });

    const getRes = await tsukiRequest("/api/annotations/nvda.us");
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({ ok: true, data: annotations });
  });
});

describe("PUT /:symbol validation", () => {
  it("rejects a body missing the annotations key", async () => {
    const res = await tsukiRequest("/api/annotations/NVDA.US", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it("rejects an unknown annotation kind", async () => {
    const res = await tsukiRequest("/api/annotations/NVDA.US", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annotations: [makeAnnotation({ kind: "circle" as Annotation["kind"] })] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an hline annotation with 2 points", async () => {
    const res = await tsukiRequest("/api/annotations/NVDA.US", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annotations: [makeAnnotation({ kind: "hline" })] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /:symbol read error", () => {
  it("surfaces a 500 when the read fails for a reason other than a missing file", async () => {
    await mkdir(join(annotationsDir, "NVDA.US.json"));
    const res = await tsukiRequest("/api/annotations/NVDA.US");
    expect(res.status).toBe(500);
  });
});

describe("symbol path traversal", () => {
  it("rejects a symbol with a path traversal attempt", async () => {
    const res = await tsukiRequest("/api/annotations/..%2Ffoo");
    expect(res.status).toBe(400);
  });
});
