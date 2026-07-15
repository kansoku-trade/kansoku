import { describe, expect, it } from "vitest";
import type { AiRoles, Catalog } from "../settings/types";
import { formatUsageLine, resolveChatModelName } from "./assistantStatusBar.js";

const catalog: Catalog = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      auth: { kind: "api_key", status: "configured" },
      models: [{ id: "claude-sonnet-5", name: "Claude Sonnet 5", thinkingLevels: ["low", "high"] }],
    },
  ],
};

const baseRole = { mode: "disabled" as const, provider: null, modelId: null, thinkingLevel: null, stale: false };

function roles(overrides: Partial<AiRoles>): AiRoles {
  return {
    primary: baseRole,
    comment: baseRole,
    analyst: baseRole,
    deepDive: baseRole,
    chat: baseRole,
    ...overrides,
  };
}

describe("resolveChatModelName", () => {
  it("resolves a custom chat role model", () => {
    const result = resolveChatModelName(
      roles({ chat: { mode: "custom", provider: "anthropic", modelId: "claude-sonnet-5", thinkingLevel: null, stale: false } }),
      catalog,
    );
    expect(result).toBe("Claude Sonnet 5");
  });

  it("resolves through inherit to the primary role", () => {
    const result = resolveChatModelName(
      roles({
        chat: { mode: "inherit", provider: null, modelId: null, thinkingLevel: null, stale: false },
        primary: { mode: "custom", provider: "anthropic", modelId: "claude-sonnet-5", thinkingLevel: null, stale: false },
      }),
      catalog,
    );
    expect(result).toBe("Claude Sonnet 5");
  });

  it("returns null when the chat role is disabled", () => {
    expect(resolveChatModelName(roles({}), catalog)).toBeNull();
  });

  it("returns null when the model is not in the catalog", () => {
    const result = resolveChatModelName(
      roles({ chat: { mode: "custom", provider: "anthropic", modelId: "missing-model", thinkingLevel: null, stale: false } }),
      catalog,
    );
    expect(result).toBeNull();
  });
});

describe("formatUsageLine", () => {
  it("returns null when usage is null", () => {
    expect(formatUsageLine("Claude Sonnet 5", null)).toBeNull();
  });

  it("returns null when calls is 0", () => {
    expect(formatUsageLine("Claude Sonnet 5", { totalTokens: 0, costTotal: 0, calls: 0 })).toBeNull();
  });

  it("formats model, tokens and cost", () => {
    expect(formatUsageLine("Claude Sonnet 5", { totalTokens: 1234, costTotal: 0.5678, calls: 2 })).toBe(
      "Claude Sonnet 5 · 本会话 1234 tokens · $0.57",
    );
  });

  it("falls back to a placeholder model label when unresolved", () => {
    expect(formatUsageLine(null, { totalTokens: 10, costTotal: 0.01, calls: 1 })).toBe("未知模型 · 本会话 10 tokens · $0.01");
  });
});
