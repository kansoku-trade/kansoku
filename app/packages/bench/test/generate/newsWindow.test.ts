import { describe, expect, it } from "vitest";
import { edgarWindow, gdeltWindow, toGdeltStamp } from "../../src/generate/newsWindow.js";

describe("gdeltWindow", () => {
  it("spans exactly 48h ending at cutoff", () => {
    const { startIso, endIso } = gdeltWindow("2026-03-19T20:00:00-04:00");
    expect(endIso).toBe(new Date("2026-03-19T20:00:00-04:00").toISOString());
    expect(Date.parse(endIso) - Date.parse(startIso)).toBe(48 * 60 * 60 * 1000);
  });

  it("produces a GDELT-formatted stamp with no separators", () => {
    const { startIso, endIso } = gdeltWindow("2026-03-19T20:00:00-04:00");
    expect(toGdeltStamp(endIso)).toMatch(/^\d{8}T\d{6}$/);
    expect(toGdeltStamp(startIso)).toMatch(/^\d{8}T\d{6}$/);
  });
});

describe("edgarWindow", () => {
  it("spans exactly 14 calendar days ending at the cutoff date", () => {
    const { startDate, endDate } = edgarWindow("2026-03-19T20:00:00-04:00");
    expect(endDate).toBe("2026-03-19");
    expect(startDate).toBe("2026-03-05");
  });

  it("handles month boundaries", () => {
    const { startDate, endDate } = edgarWindow("2026-01-05T20:00:00-04:00");
    expect(endDate).toBe("2026-01-05");
    expect(startDate).toBe("2025-12-22");
  });
});
