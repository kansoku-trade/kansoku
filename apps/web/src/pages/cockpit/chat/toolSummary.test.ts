import { describe, expect, it } from "vitest";
import { summarizeToolInput, toolRowKey } from "./toolSummary.js";

describe("summarizeToolInput", () => {
  it("returns empty string when no input", () => {
    expect(summarizeToolInput(undefined)).toBe("");
    expect(summarizeToolInput("")).toBe("");
  });

  it("takes the first line and trims it", () => {
    expect(summarizeToolInput("  ls -la  \nmore stuff")).toBe("ls -la");
  });

  it("truncates long first lines with an ellipsis", () => {
    const long = "a".repeat(120);
    const result = summarizeToolInput(long);
    expect(result.length).toBe(80);
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate a short first line", () => {
    expect(summarizeToolInput("short input")).toBe("short input");
  });
});

describe("toolRowKey", () => {
  it("combines scope and id", () => {
    expect(toolRowKey("history", "row-1")).toBe("history:row-1");
    expect(toolRowKey("live", "tool-2")).toBe("live:tool-2");
  });
});
