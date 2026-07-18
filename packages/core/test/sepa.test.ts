import { describe, expect, it } from "vitest";
import type { SepaCheck, SepaChartData, SepaVerdict } from "@kansoku/shared/types";
import { buildSepa, type SepaInput, type SepaMeta } from "../src/services/sepa.js";
import { approxDiff, loadFixture } from "./helpers.js";

interface SepaExpected {
  meta: SepaMeta;
  data: SepaChartData;
  checks: SepaCheck[];
  verdict: SepaVerdict;
}

describe("sepa parity vs python golden fixture", () => {
  const input = loadFixture<SepaInput>("sepa-input.json");
  const expected = loadFixture<SepaExpected>("sepa-expected.json");
  const { built, meta } = buildSepa(input);

  it("chart data matches", () => {
    expect(approxDiff(built.chart, expected.data)).toBeNull();
  });

  it("checks match", () => {
    expect(approxDiff(built.sidebar.checks, expected.checks)).toBeNull();
  });

  it("verdict matches", () => {
    expect(approxDiff(built.sidebar.verdict, expected.verdict)).toBeNull();
  });

  it("meta matches", () => {
    expect(meta.verdict_tier).toBe(expected.meta.verdict_tier);
    expect(meta.fails).toBe(expected.meta.fails);
    expect(meta.passes).toBe(expected.meta.passes);
    expect(meta.bars).toBe(expected.meta.bars);
  });
});
