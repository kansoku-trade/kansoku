import { describe, expect, it } from "vitest";
import {
  ARCHIVE_WINDOW_HOURS,
  archiveCachePeriod,
  archiveFileUrl,
  enumerateArchiveGrid,
  formatArchiveStamp,
} from "../../src/generate/gdeltArchiveWindow.js";

const CUTOFF = "2026-03-25T20:00:00-04:00";

describe("enumerateArchiveGrid", () => {
  it("produces exactly 192 stamps for a 48h/15min window", () => {
    const stamps = enumerateArchiveGrid(CUTOFF);
    expect(stamps).toHaveLength((ARCHIVE_WINDOW_HOURS * 60) / 15);
  });

  it("ends at the cutoff instant and starts 48h earlier, exclusive of the start boundary", () => {
    const stamps = enumerateArchiveGrid(CUTOFF);
    expect(stamps[stamps.length - 1]).toBe(formatArchiveStamp(Date.parse(CUTOFF)));
    expect(stamps[0]).toBe(formatArchiveStamp(Date.parse(CUTOFF) - 48 * 60 * 60 * 1000 + 15 * 60 * 1000));
  });

  it("every stamp lands on the 00/15/30/45 minute grid", () => {
    const stamps = enumerateArchiveGrid(CUTOFF);
    for (const stamp of stamps) {
      const minute = stamp.slice(10, 12);
      expect(["00", "15", "30", "45"]).toContain(minute);
      expect(stamp.slice(12, 14)).toBe("00");
    }
  });

  it("supports a custom window length", () => {
    const stamps = enumerateArchiveGrid(CUTOFF, 1);
    expect(stamps).toHaveLength(4);
  });

  it("throws when the cutoff is not aligned to the 15-minute grid", () => {
    expect(() => enumerateArchiveGrid("2026-03-25T20:07:00-04:00")).toThrow(/not aligned/);
  });
});

describe("archiveCachePeriod", () => {
  it("is stable and shared across symbols for the same cutoff", () => {
    expect(archiveCachePeriod(CUTOFF)).toBe(archiveCachePeriod(CUTOFF));
  });

  it("differs across different cutoffs", () => {
    expect(archiveCachePeriod(CUTOFF)).not.toBe(archiveCachePeriod("2026-06-15T20:00:00-04:00"));
  });
});

describe("archiveFileUrl", () => {
  it("builds the direct gkg zip download URL for a grid stamp", () => {
    expect(archiveFileUrl("20260323133000")).toBe("http://data.gdeltproject.org/gdeltv2/20260323133000.gkg.csv.zip");
  });
});
