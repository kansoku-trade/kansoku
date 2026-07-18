import { describe, expect, it } from "vitest";
import { buildPaletteCommands } from "./commands.js";

describe("buildPaletteCommands", () => {
  it("lists symbol candidates and static commands when the query is empty", () => {
    const commands = buildPaletteCommands("", ["NVDA.US", "MRVL.US"]);
    expect(commands.map((c) => c.id)).toEqual([
      "symbol:NVDA.US",
      "symbol:MRVL.US",
      "nav:home",
      "nav:research",
      "nav:chat",
      "nav:settings",
      "nav:logs",
    ]);
  });

  it("exposes the assistant chat through chat keywords", () => {
    expect(buildPaletteCommands("chat", []).map((command) => command.id)).toContain("nav:chat");
    expect(buildPaletteCommands("对话", []).map((command) => command.id)).toContain("nav:chat");
  });

  it("dedupes symbols across sources", () => {
    const commands = buildPaletteCommands("", ["NVDA.US", "NVDA.US"]);
    expect(commands.filter((c) => c.id === "symbol:NVDA.US")).toHaveLength(1);
  });

  it("filters candidates case-insensitively", () => {
    const commands = buildPaletteCommands("mrvl", ["NVDA.US", "MRVL.US"]);
    expect(commands.map((c) => c.id)).toEqual(["symbol:MRVL.US"]);
  });

  it("adds a direct-go command for an unknown valid code", () => {
    const commands = buildPaletteCommands("amd", ["NVDA.US"]);
    expect(commands[0]).toMatchObject({ id: "symbol:AMD.US", route: "/symbol/AMD.US" });
  });

  it("does not duplicate the direct-go command when the symbol is already a candidate", () => {
    const commands = buildPaletteCommands("nvda", ["NVDA.US"]);
    expect(commands.filter((c) => c.id === "symbol:NVDA.US")).toHaveLength(1);
  });

  it("skips the direct-go command for invalid input", () => {
    const commands = buildPaletteCommands("nvda extra", ["NVDA.US"]);
    expect(commands.some((c) => c.id.startsWith("symbol:NVDA EXTRA"))).toBe(false);
  });

  it("matches static commands by keyword", () => {
    const commands = buildPaletteCommands("settings", []);
    expect(commands.some((c) => c.id === "nav:settings")).toBe(true);
  });

  it("exposes the research library through journal and stock keywords", () => {
    expect(buildPaletteCommands("journal", []).map((command) => command.id)).toContain("nav:research");
    expect(buildPaletteCommands("笔记", []).map((command) => command.id)).toContain("nav:research");
  });

  it("caps the list length", () => {
    const symbols = Array.from({ length: 30 }, (_, i) => `SYM${i}.US`);
    expect(buildPaletteCommands("", symbols).length).toBeLessThanOrEqual(12);
  });
});
