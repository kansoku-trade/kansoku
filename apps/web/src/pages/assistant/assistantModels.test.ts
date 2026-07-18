import { describe, expect, it } from "vitest";
import type { AiRoles, Catalog } from "../settings/types";
import {
  assistantModelLabels,
  assistantModelValue,
  buildAssistantModelChoices,
  resolveAssistantModelValue,
  roleSettingForAssistantModel,
} from "./assistantModels";

const disabled = { mode: "disabled" as const, provider: null, modelId: null, thinkingLevel: null, stale: false };

const catalog: Catalog = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      auth: { kind: "api_key", status: "configured" },
      models: [{ id: "claude-sonnet", name: "Claude Sonnet", thinkingLevels: ["high"] }],
    },
    {
      id: "openai",
      name: "OpenAI",
      auth: { kind: "api_key", status: "missing" },
      models: [{ id: "gpt", name: "GPT", thinkingLevels: ["off"] }],
    },
  ],
};

function roles(overrides: Partial<AiRoles>): AiRoles {
  return { primary: disabled, comment: disabled, analyst: disabled, deepDive: disabled, chat: disabled, ...overrides };
}

describe("assistant model selection", () => {
  it("offers only models whose providers are configured", () => {
    expect(buildAssistantModelChoices(catalog)).toEqual([
      {
        value: assistantModelValue("anthropic", "claude-sonnet"),
        label: "Claude Sonnet · Anthropic",
        provider: "anthropic",
        modelId: "claude-sonnet",
        thinkingLevel: "high",
      },
    ]);
  });

  it("resolves the inherited primary model as the active chat selection", () => {
    expect(
      resolveAssistantModelValue(
        roles({
          primary: { mode: "custom", provider: "anthropic", modelId: "claude-sonnet", thinkingLevel: "high", stale: false },
          chat: { mode: "inherit", provider: null, modelId: null, thinkingLevel: null, stale: false },
        }),
      ),
    ).toBe(assistantModelValue("anthropic", "claude-sonnet"));
  });

  it("converts a selected model into a persisted chat-role setting and a message label", () => {
    const [choice] = buildAssistantModelChoices(catalog);
    expect(roleSettingForAssistantModel(choice!)).toEqual({
      mode: "custom",
      provider: "anthropic",
      modelId: "claude-sonnet",
      thinkingLevel: "high",
      stale: false,
    });
    expect(assistantModelLabels(catalog)[assistantModelValue("anthropic", "claude-sonnet")]).toBe("Claude Sonnet");
  });
});
