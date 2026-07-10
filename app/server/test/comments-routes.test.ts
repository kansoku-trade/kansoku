import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CockpitComment } from "../../shared/types.js";

const comments = vi.hoisted(() => ({
  listComments: vi.fn(),
  listCommentDates: vi.fn(),
  onComment: vi.fn(),
  appendComment: vi.fn(),
}));

vi.mock("../src/ai/comments.js", () => comments);

const { tsukiRequest } = await import("./helpers.js");
const { easternDate } = await import("../src/services/session.js");

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
    const res = await tsukiRequest("/api/symbols/mu/comments");
    expect(res.status).toBe(200);
    expect(comments.listComments).toHaveBeenCalledWith("MU.US", easternDate());
  });

  it("honors an explicit date and returns the stored list", async () => {
    comments.listComments.mockResolvedValue([comment()]);
    const res = await tsukiRequest("/api/symbols/MU.US/comments?date=2026-07-01");
    expect(res.status).toBe(200);
    expect(comments.listComments).toHaveBeenCalledWith("MU.US", "2026-07-01");
    expect((await res.json()).data).toHaveLength(1);
  });

  it("returns an empty list when there is no file for the date", async () => {
    const res = await tsukiRequest("/api/symbols/MU.US/comments?date=2026-07-03");
    expect(await res.json()).toEqual({ ok: true, data: [] });
  });

  it("rejects a malformed date", async () => {
    const res = await tsukiRequest("/api/symbols/MU.US/comments?date=../evil");
    expect(res.status).toBe(400);
    expect(comments.listComments).not.toHaveBeenCalled();
  });
});

describe("GET /:sym/comment-dates", () => {
  it("returns the distinct comment dates for the symbol", async () => {
    comments.listCommentDates.mockResolvedValue(["2026-07-02", "2026-07-01"]);
    const res = await tsukiRequest("/api/symbols/mu/comment-dates");
    expect(res.status).toBe(200);
    expect(comments.listCommentDates).toHaveBeenCalledWith("MU.US");
    expect((await res.json()).data).toEqual(["2026-07-02", "2026-07-01"]);
  });
});

describe("GET /:sym/journal", () => {
  it("returns an ok-wrapped array", async () => {
    const res = await tsukiRequest("/api/symbols/MU.US/journal");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    for (const row of body.data) {
      expect(row.name).toMatch(/^\d{4}-\d{2}-\d{2}-mu(-|\.)/);
    }
  });

  it("rejects a journal name that is not a dated markdown file", async () => {
    const res = await tsukiRequest("/api/symbols/MU.US/journal/evil.txt");
    expect(res.status).toBe(400);
  });

  it("rejects path traversal in the journal name", async () => {
    const res = await tsukiRequest("/api/symbols/MU.US/journal/..%2F..%2Fsecrets.md");
    expect(res.status).toBe(400);
  });

  it("404s on a missing journal file", async () => {
    const res = await tsukiRequest("/api/symbols/MU.US/journal/2020-01-01-mu-intraday.md");
    expect(res.status).toBe(404);
  });
});
