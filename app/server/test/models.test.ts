import { afterEach, describe, expect, it } from "vitest";
import { aiConfig, type AiModel, parseModelRef, resolveModel } from "../src/ai/models.js";

const fakeModel = { provider: "anthropic", id: "claude-haiku-4-5" } as unknown as AiModel;

describe("parseModelRef", () => {
  it("splits on the first slash", () => {
    expect(parseModelRef("anthropic/claude-haiku-4-5")).toEqual({
      provider: "anthropic",
      id: "claude-haiku-4-5",
    });
  });

  it("keeps later slashes inside the id", () => {
    expect(parseModelRef("openrouter/google/gemini-2.5-flash")).toEqual({
      provider: "openrouter",
      id: "google/gemini-2.5-flash",
    });
  });

  it("parses a thinking-level suffix", () => {
    expect(parseModelRef("openai-codex/gpt-5.5:high")).toEqual({
      provider: "openai-codex",
      id: "gpt-5.5",
      thinkingLevel: "high",
    });
  });

  it("keeps an unknown colon suffix inside the id", () => {
    expect(parseModelRef("openai-codex/gpt-5.5:turbo")).toEqual({
      provider: "openai-codex",
      id: "gpt-5.5:turbo",
    });
  });

  it("rejects missing provider or id", () => {
    expect(parseModelRef("")).toBeNull();
    expect(parseModelRef("noslash")).toBeNull();
    expect(parseModelRef("/onlyid")).toBeNull();
    expect(parseModelRef("onlyprovider/")).toBeNull();
  });
});

describe("resolveModel", () => {
  it("returns null when the env value is missing", () => {
    expect(resolveModel(undefined)).toBeNull();
    expect(resolveModel("")).toBeNull();
  });

  it("returns null for an unparseable ref without calling lookup", () => {
    let called = false;
    const lookup = () => {
      called = true;
      return fakeModel;
    };
    expect(resolveModel("garbage", lookup)).toBeNull();
    expect(called).toBe(false);
  });

  it("returns the resolved model", () => {
    const lookup = (provider: string, id: string) => {
      expect(provider).toBe("anthropic");
      expect(id).toBe("claude-haiku-4-5");
      return fakeModel;
    };
    expect(resolveModel("anthropic/claude-haiku-4-5", lookup)).toBe(fakeModel);
  });

  it("attaches the thinking level to the resolved model", () => {
    const model = resolveModel("anthropic/claude-haiku-4-5:high", () => fakeModel);
    expect(model).not.toBe(fakeModel);
    expect(model?.id).toBe("claude-haiku-4-5");
    expect(model?.thinkingLevel).toBe("high");
  });

  it("returns null when the model is unknown", () => {
    expect(resolveModel("anthropic/does-not-exist", () => undefined)).toBeNull();
  });

  it("returns null and does not throw when lookup throws", () => {
    const lookup = () => {
      throw new Error("unknown provider");
    };
    expect(() => resolveModel("bogus/model", lookup)).not.toThrow();
    expect(resolveModel("bogus/model", lookup)).toBeNull();
  });

  it("resolves a real built-in model through the default lookup", () => {
    const model = resolveModel("anthropic/claude-haiku-4-5");
    expect(model).not.toBeNull();
    expect(model?.id).toBe("claude-haiku-4-5");
  });
});

describe("aiConfig", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env.AI_COMMENT_MODEL = prev.AI_COMMENT_MODEL;
    process.env.AI_ANALYST_MODEL = prev.AI_ANALYST_MODEL;
    process.env.AI_DEEPDIVE_MODEL = prev.AI_DEEPDIVE_MODEL;
    process.env.AI_CHAT_MODEL = prev.AI_CHAT_MODEL;
  });

  it("returns null for every layer when unset", () => {
    delete process.env.AI_COMMENT_MODEL;
    delete process.env.AI_ANALYST_MODEL;
    delete process.env.AI_DEEPDIVE_MODEL;
    delete process.env.AI_CHAT_MODEL;
    expect(aiConfig()).toEqual({
      commentModel: null,
      analystModel: null,
      deepDiveModel: null,
      chatModel: null,
    });
  });

  it("resolves each layer from its env var", () => {
    process.env.AI_COMMENT_MODEL = "anthropic/claude-haiku-4-5";
    delete process.env.AI_ANALYST_MODEL;
    const config = aiConfig();
    expect(config.commentModel?.id).toBe("claude-haiku-4-5");
    expect(config.analystModel).toBeNull();
  });

  it("resolves deepDiveModel from AI_DEEPDIVE_MODEL", () => {
    process.env.AI_DEEPDIVE_MODEL = "anthropic/claude-haiku-4-5";
    expect(aiConfig().deepDiveModel?.id).toBe("claude-haiku-4-5");
  });

  it("returns null deepDiveModel when unset", () => {
    delete process.env.AI_DEEPDIVE_MODEL;
    expect(aiConfig().deepDiveModel).toBeNull();
  });

  it("uses AI_CHAT_MODEL when set", () => {
    process.env.AI_CHAT_MODEL = "anthropic/claude-haiku-4-5";
    delete process.env.AI_ANALYST_MODEL;
    expect(aiConfig().chatModel?.id).toBe("claude-haiku-4-5");
  });

  it("falls back to the resolved analyst model when AI_CHAT_MODEL is unset", () => {
    delete process.env.AI_CHAT_MODEL;
    process.env.AI_ANALYST_MODEL = "anthropic/claude-haiku-4-5";
    const config = aiConfig();
    expect(config.chatModel?.id).toBe("claude-haiku-4-5");
    expect(config.chatModel).toBe(config.analystModel);
  });

  it("falls back to the analyst model when AI_CHAT_MODEL is unresolvable", () => {
    process.env.AI_CHAT_MODEL = "bogus/does-not-exist";
    process.env.AI_ANALYST_MODEL = "anthropic/claude-haiku-4-5";
    const config = aiConfig();
    expect(config.chatModel?.id).toBe("claude-haiku-4-5");
  });

  it("returns null chatModel when both AI_CHAT_MODEL and AI_ANALYST_MODEL are unset", () => {
    delete process.env.AI_CHAT_MODEL;
    delete process.env.AI_ANALYST_MODEL;
    expect(aiConfig().chatModel).toBeNull();
  });
});
