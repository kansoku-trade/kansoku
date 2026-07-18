import { describe, expect, it } from "vitest";
import { deriveSettingsViewModel } from "./settingsViewModel";
import type { AiSettings, Catalog, RoleSetting, UsageToday } from "./types";

const custom = (provider: string, modelId: string): RoleSetting => ({
  mode: "custom",
  provider,
  modelId,
  thinkingLevel: "off",
  stale: false,
});

const roles = {
  primary: custom("deepseek", "deepseek-v4"),
  comment: { mode: "inherit", provider: null, modelId: null, thinkingLevel: null, stale: false } satisfies RoleSetting,
  analyst: custom("anthropic", "claude-opus"),
  deepDive: { mode: "disabled", provider: null, modelId: null, thinkingLevel: null, stale: false } satisfies RoleSetting,
  chat: { mode: "inherit", provider: null, modelId: null, thinkingLevel: null, stale: false } satisfies RoleSetting,
};

const settings: AiSettings = {
  roles,
  credentials: [
    { provider: "deepseek", kind: "api_key", masked: "sk-••••9A2F", updatedAt: "2026-07-10", ok: true },
  ],
  masterKey: "ready",
};

const catalog: Catalog = {
  providers: [
    {
      id: "deepseek",
      name: "DeepSeek",
      auth: { kind: "api_key", status: "configured" },
      models: [{ id: "deepseek-v4", name: "DeepSeek V4", thinkingLevels: ["off"] }],
    },
    {
      id: "anthropic",
      name: "Anthropic",
      auth: { kind: "api_key", status: "missing" },
      models: [{ id: "claude-opus", name: "Claude Opus", thinkingLevels: ["off", "high"] }],
    },
    {
      id: "openai-codex",
      name: "OpenAI Codex",
      auth: { kind: "oauth", status: "missing" },
      models: [{ id: "gpt-5.4", name: "GPT-5.4", thinkingLevels: ["off", "high"] }],
    },
  ],
};

const usage: UsageToday = {
  roles: {
    comment: { calls: 91, cost: 0.42 },
    analyst: { calls: 8, cost: 0.76 },
    deepDive: { calls: 0, cost: 0 },
    chat: { calls: 28, cost: 0.64 },
  },
  total: { calls: 127, cost: 1.82 },
};

describe("deriveSettingsViewModel", () => {
  it("resolves inherited, custom, and disabled role labels", () => {
    const view = deriveSettingsViewModel({ settings, catalog, usage, roles });

    expect(view.roles.comment.effectiveLabel).toBe("DeepSeek V4 · 关闭思考");
    expect(view.roles.analyst.effectiveLabel).toBe("Anthropic 未配置认证，此用途暂停");
    expect(view.roles.deepDive.effectiveLabel).toBe("已停用，不会发起调用");
  });

  it("groups missing authentication by provider and ignores unused providers", () => {
    const view = deriveSettingsViewModel({ settings, catalog, usage, roles });

    expect(view.issues.map((issue) => issue.id)).toEqual(["missing-auth-anthropic"]);
    expect(view.summary.statusLabel).toBe("1 项需要处理");
  });

  it("reports one missing-primary issue for all inherited roles", () => {
    const missingPrimaryRoles = {
      ...roles,
      primary: { mode: "disabled", provider: null, modelId: null, thinkingLevel: null, stale: false } satisfies RoleSetting,
      analyst: { mode: "disabled", provider: null, modelId: null, thinkingLevel: null, stale: false } satisfies RoleSetting,
    };
    const view = deriveSettingsViewModel({
      settings: { ...settings, roles: missingPrimaryRoles },
      catalog,
      usage,
      roles: missingPrimaryRoles,
    });

    expect(view.issues.map((issue) => issue.id)).toEqual(["missing-primary"]);
    expect(view.issues[0]?.detail).toContain("盘中快评、追问");
  });

  it("sorts master-key errors ahead of stale custom models without duplicating api-key errors", () => {
    const invalidRoles = {
      ...roles,
      analyst: { ...roles.analyst, stale: true },
    };
    const view = deriveSettingsViewModel({
      settings: { ...settings, roles: invalidRoles, masterKey: "invalid" },
      catalog,
      usage,
      roles: invalidRoles,
    });

    expect(view.issues.map((issue) => issue.id)).toEqual(["master-key-invalid", "stale-model-analyst"]);
    expect(view.summary.statusTone).toBe("down");
  });

  it("reports missing Codex login only when an enabled role uses Codex", () => {
    const codexRoles = {
      ...roles,
      analyst: { mode: "disabled", provider: null, modelId: null, thinkingLevel: null, stale: false } satisfies RoleSetting,
      chat: custom("openai-codex", "gpt-5.4"),
    };
    const view = deriveSettingsViewModel({
      settings: { ...settings, roles: codexRoles },
      catalog,
      usage,
      roles: codexRoles,
    });

    expect(view.issues.map((issue) => issue.id)).toEqual(["missing-auth-openai-codex"]);
    expect(view.roles.chat.tone).toBe("warning");
  });

  it("keeps configuration usable when today's usage cannot load", () => {
    const view = deriveSettingsViewModel({ settings, catalog, usage: null, roles });

    expect(view.summary.usageLabel).toBe("暂不可用");
    expect(view.roles.comment.usageLabel).toBe("今日 —");
  });
});
