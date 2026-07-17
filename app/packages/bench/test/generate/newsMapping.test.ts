import { describe, expect, it } from "vitest";
import {
  assertNoLeak,
  edgarDocumentUrl,
  mapEdgarFilings,
  mapGdeltArticles,
  normalizeTitle,
} from "../../src/generate/newsMapping.js";
import type { EdgarFiling, GdeltArticle } from "../../src/generate/newsMapping.js";

const CUTOFF = "2026-03-19T20:00:00-04:00";

function article(overrides: Partial<GdeltArticle> = {}): GdeltArticle {
  return {
    url: "https://example.com/a",
    title: "Micron beats estimates",
    seendate: "20260319T120000Z",
    domain: "example.com",
    ...overrides,
  };
}

describe("mapGdeltArticles", () => {
  it("keeps an article seen exactly at cutoff", () => {
    const items = mapGdeltArticles([article({ seendate: "20260320T000000Z" })], CUTOFF);
    expect(items).toHaveLength(1);
  });

  it("rejects an article seen after cutoff", () => {
    const items = mapGdeltArticles([article({ seendate: "20260320T000001Z" })], CUTOFF);
    expect(items).toHaveLength(0);
  });

  it("dedupes by normalized title, keeping the first occurrence", () => {
    const items = mapGdeltArticles(
      [
        article({ url: "https://a.com/1", title: "Micron Beats Estimates!", seendate: "20260319T100000Z" }),
        article({ url: "https://b.com/2", title: "micron beats estimates", seendate: "20260319T090000Z" }),
      ],
      CUTOFF,
    );
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://a.com/1");
  });

  it("sorts by seendate descending", () => {
    const items = mapGdeltArticles(
      [
        article({ url: "https://a.com/1", title: "Older", seendate: "20260317T100000Z" }),
        article({ url: "https://a.com/2", title: "Newer", seendate: "20260319T100000Z" }),
      ],
      CUTOFF,
    );
    expect(items.map((item) => item.title)).toEqual(["Newer", "Older"]);
  });

  it("caps at 10 items", () => {
    const articles = Array.from({ length: 15 }, (_, i) =>
      article({ url: `https://a.com/${i}`, title: `Story ${i}`, seendate: "20260319T100000Z" }),
    );
    const items = mapGdeltArticles(articles, CUTOFF);
    expect(items).toHaveLength(10);
  });

  it("stamps each item with a gdelt: source label and stable id", () => {
    const items = mapGdeltArticles([article()], CUTOFF);
    expect(items[0].source).toBe("gdelt:example.com");
    expect(items[0].id).toMatch(/^gdelt-/);
  });
});

describe("normalizeTitle", () => {
  it("ignores case, punctuation, and surrounding whitespace", () => {
    expect(normalizeTitle("  Micron Beats!  Estimates.  ")).toBe(normalizeTitle("micron beats estimates"));
  });
});

function filing(overrides: Partial<EdgarFiling> = {}): EdgarFiling {
  return {
    form: "8-K",
    filingDate: "2026-03-10",
    primaryDocument: "mu-8k.htm",
    accessionNumber: "0000723125-26-000042",
    ...overrides,
  };
}

describe("mapEdgarFilings", () => {
  const window = { startDate: "2026-03-05", endDate: "2026-03-19" };

  it("keeps filings inside the 14-day window and drops those outside", () => {
    const items = mapEdgarFilings(
      [filing({ filingDate: "2026-03-10" }), filing({ filingDate: "2026-02-20", accessionNumber: "0000723125-26-000001" })],
      CUTOFF,
      "0000723125",
      window.startDate,
      window.endDate,
    );
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("8-K filed 2026-03-10");
  });

  it("filters to 8-K/10-Q/10-K only", () => {
    const items = mapEdgarFilings(
      [filing({ form: "4" }), filing({ form: "10-Q", accessionNumber: "0000723125-26-000002" })],
      CUTOFF,
      "0000723125",
      window.startDate,
      window.endDate,
    );
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("edgar:10-Q");
  });

  it("rejects a filing whose midnight-UTC timestamp falls after the exact cutoff instant", () => {
    const items = mapEdgarFilings(
      [filing({ filingDate: "2026-03-19" })],
      "2026-03-19T00:00:00+05:00",
      "0000723125",
      window.startDate,
      "2026-03-19",
    );
    expect(items).toHaveLength(0);
  });

  it("builds a document URL without cik zero-padding or accession dashes", () => {
    const url = edgarDocumentUrl("0000723125", "0000723125-26-000042", "mu-8k.htm");
    expect(url).toBe("https://www.sec.gov/Archives/edgar/data/723125/000072312526000042/mu-8k.htm");
  });
});

describe("assertNoLeak", () => {
  it("passes when every item is on or before cutoff", () => {
    expect(() => assertNoLeak([{ id: "x", title: "t", published_at: "2026-03-19T12:00:00Z", url: "u" }], CUTOFF)).not.toThrow();
  });

  it("throws when an item leaks past cutoff", () => {
    expect(() =>
      assertNoLeak([{ id: "x", title: "t", published_at: "2026-03-21T00:00:00Z", url: "u" }], CUTOFF),
    ).toThrow(/leaks post-cutoff/);
  });
});
