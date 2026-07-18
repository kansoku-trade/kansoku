import { describe, expect, it } from "vitest";
import { conversationAdapters, usageFromEnvelope } from "./useChatSession";

describe("conversationAdapters", () => {
  it("wires the assistant kind to the assistant-chat channel", () => {
    expect(conversationAdapters.assistant.channel("s1")).toEqual({ kind: "assistant-chat", id: "s1" });
  });

  it("wires the chart kind to the chat channel", () => {
    expect(conversationAdapters.chart.channel("c1")).toEqual({ kind: "chat", id: "c1" });
  });

  it("wires the research kind to the research-chat channel", () => {
    expect(conversationAdapters.research.channel("r1")).toEqual({ kind: "research-chat", path: "r1" });
  });

  it("has no suggestions adapter for assistant", () => {
    expect(conversationAdapters.assistant.suggest).toBeNull();
  });

  it("has a suggestions adapter for chart and research", () => {
    expect(conversationAdapters.chart.suggest).not.toBeNull();
    expect(conversationAdapters.research.suggest).not.toBeNull();
  });
});

describe("usageFromEnvelope", () => {
  it("passes through usage when present", () => {
    const usage = { totalTokens: 120, costTotal: 0.03, calls: 4 };
    expect(usageFromEnvelope({ usage })).toEqual(usage);
  });

  it("returns null when usage is absent", () => {
    expect(usageFromEnvelope({})).toBeNull();
  });
});
