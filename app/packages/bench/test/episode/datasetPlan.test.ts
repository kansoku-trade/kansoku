import { describe, expect, it } from "vitest";
import { EpisodeDatasetPlanError, assertEpisodeDatasetPlan } from "../../src/episode/datasetPlan.js";

describe("episode dataset plans", () => {
  it("accepts a 2026 live cohort", () => {
    const plan = assertEpisodeDatasetPlan({
      schemaVersion: 1,
      id: "v2-live-pilot",
      cohort: "live-2026",
      horizonSessions: 40,
      cases: [{ symbol: "MU.US", cutoff: "2026-03-25" }],
    });
    expect(plan.cohort).toBe("live-2026");
  });

  it("requires anonymous aliases, synthetic 2026 dates, and weekday-preserving shifts for blind cases", () => {
    const plan = assertEpisodeDatasetPlan({
      schemaVersion: 1,
      id: "v2-blind-pilot",
      cohort: "blind-anonymous",
      horizonSessions: 40,
      cases: [
        {
          symbol: "MU.US",
          cutoff: "2024-03-27",
          alias: "ASSET001",
          syntheticCutoff: "2026-03-25",
        },
      ],
    });
    expect(plan.cases[0].alias).toBe("ASSET001");

    expect(() =>
      assertEpisodeDatasetPlan({
        ...plan,
        cases: [{ symbol: "MU.US", cutoff: "2024-03-27" }],
      }),
    ).toThrow(EpisodeDatasetPlanError);
  });

  it("rejects pre-2026 live cutoffs", () => {
    expect(() =>
      assertEpisodeDatasetPlan({
        schemaVersion: 1,
        id: "v2-live-pilot",
        cohort: "live-2026",
        horizonSessions: 40,
        cases: [{ symbol: "MU.US", cutoff: "2025-12-31" }],
      }),
    ).toThrow(/must be in 2026/);
  });
});
