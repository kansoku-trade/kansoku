import { describe, expect, it } from "vitest";
import { formatElapsedDuration } from "./AnalysisRunDetails";

describe("formatElapsedDuration", () => {
  it("formats seconds, minutes, and hours as a readable running duration", () => {
    expect(formatElapsedDuration(9_900)).toBe("9 秒");
    expect(formatElapsedDuration(65_000)).toBe("1 分 05 秒");
    expect(formatElapsedDuration(3_723_000)).toBe("1 小时 02 分 03 秒");
  });

  it("clamps future start times to zero", () => {
    expect(formatElapsedDuration(-5_000)).toBe("0 秒");
  });
});
