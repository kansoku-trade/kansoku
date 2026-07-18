import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";
import { RUN_CONFIG_DEFAULTS, runConfigSchema } from "../../src/schema/runConfig.js";

function baseRunConfig(overrides: Record<string, unknown> = {}) {
  return {
    models: ["anthropic/claude-sonnet-5", "deepseek/deepseek-chat"],
    bank: "swing",
    modes: ["blind", "live"],
    repeat: 3,
    datasetVersion: "v1",
    temperatures: { "anthropic/claude-sonnet-5": "default", "deepseek/deepseek-chat": 0.7 },
    weights: RUN_CONFIG_DEFAULTS.weights,
    timeoutMs: RUN_CONFIG_DEFAULTS.timeoutMs,
    ...overrides,
  };
}

describe("runConfigSchema", () => {
  it("accepts a valid run config with default weights and timeout", () => {
    expect(Value.Check(runConfigSchema, baseRunConfig())).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(Value.Check(runConfigSchema, baseRunConfig({ extraField: true }))).toBe(false);
  });

  it("rejects an unknown bank literal", () => {
    expect(Value.Check(runConfigSchema, baseRunConfig({ bank: "bogus" }))).toBe(false);
  });
});
