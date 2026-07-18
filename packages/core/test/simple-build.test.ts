import { describe, expect, it } from "vitest";
import type { ChartDoc } from "@kansoku/shared/types";
import { migrateLegacyDoc, rebuild } from "../src/services/build.js";
import { cleanCohortRows } from "../src/services/simple.js";

const FLOW_ROWS = [
  { time: "2026-07-02T13:30:00Z", inflow: "1200" },
  { time: "2026-07-02T13:31:00Z", inflow: -800 },
];

describe("rebuild flow/cohort", () => {
  it("produces a simple flow built with raw rows", () => {
    const result = rebuild("flow", { symbol: "NVDA.US", rows: FLOW_ROWS, subtitle: "test" });
    expect(result.built).toEqual({ kind: "simple", chartType: "flow", rows: FLOW_ROWS, subtitle: "test" });
    expect(result.title).toBe("NVDA.US 主力资金流");
    expect(result.sessionDate).toBe("2026-07-02");
    expect(result.meta).toEqual({ rows: 2 });
  });

  it("produces a simple cohort built with cleaned sorted rows", () => {
    const rows = [
      { symbol: "MU", value: "1500" },
      { label: "SMH", value: -300 },
    ];
    const result = rebuild("cohort", { rows, subtitle: "" });
    expect(result.built).toEqual({
      kind: "simple",
      chartType: "cohort",
      rows: [
        { label: "SMH", value: -300 },
        { label: "MU", value: 1500 },
      ],
      subtitle: "",
    });
  });

  it("rejects cohort rows without label or symbol", () => {
    expect(() => cleanCohortRows([{ value: 1 }])).toThrow(/label/);
  });
});

describe("migrateLegacyDoc", () => {
  const legacyDoc = (overrides: Partial<ChartDoc>): ChartDoc =>
    ({
      id: "2026-07-02-nvda-flow",
      schema_version: 2,
      type: "flow",
      title: "NVDA.US 主力资金流",
      symbol: "NVDA.US",
      created_at: "2026-07-02T20:00:00Z",
      updated_at: "2026-07-02T20:00:00Z",
      input: { symbol: "NVDA.US", rows: FLOW_ROWS, subtitle: "" },
      built: { kind: "echarts", option: {}, subtitle: "", rows: 2 },
      ...overrides,
    }) as unknown as ChartDoc;

  it("rebuilds legacy echarts docs into the simple format", () => {
    const migrated = migrateLegacyDoc(legacyDoc({}));
    expect(migrated.built).toEqual({ kind: "simple", chartType: "flow", rows: FLOW_ROWS, subtitle: "" });
    expect(migrated.title).toBe("NVDA.US 主力资金流");
  });

  it("leaves non-legacy docs untouched", () => {
    const doc = legacyDoc({ built: { kind: "simple", chartType: "flow", rows: [], subtitle: "" } });
    expect(migrateLegacyDoc(doc)).toBe(doc);
  });

  it("returns the doc unchanged when rebuild fails", () => {
    const doc = legacyDoc({ input: { symbol: "NVDA.US", rows: [], subtitle: "" } });
    expect(migrateLegacyDoc(doc)).toBe(doc);
  });
});
