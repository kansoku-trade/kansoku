import type { AgentEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { AgentTimeoutError, createAgentSession, type AiAgentFactory } from "../src/ai/agentSession.js";
import type { AiModel } from "../src/ai/models.js";

const fakeModel = { provider: "anthropic", id: "claude-haiku-4-5" } as unknown as AiModel;

const fakeTool: AgentTool = {
  name: "noop",
  description: "noop",
  label: "Noop",
  parameters: Type.Object({}),
  execute: async () => ({ content: [], details: {} }),
};

const fakeMessage: AgentMessage = { role: "user", content: "hi", timestamp: 0 };

describe("createAgentSession", () => {
  it("passes systemPrompt/model/tools/messages verbatim to the factory", () => {
    let received: Parameters<AiAgentFactory>[0] | undefined;
    const agentFactory: AiAgentFactory = (config) => {
      received = config;
      return { prompt: async () => {}, abort: () => {} };
    };

    createAgentSession({
      layer: "chat",
      symbol: "MU.US",
      model: fakeModel,
      systemPrompt: "system prompt",
      tools: [fakeTool],
      messages: [fakeMessage],
      agentFactory,
    });

    expect(received?.systemPrompt).toBe("system prompt");
    expect(received?.model).toBe(fakeModel);
    expect(received?.tools).toEqual([fakeTool]);
    expect(received?.messages).toEqual([fakeMessage]);
  });

  it("forwards events emitted by the handle's subscribe to onEvent", () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const agentFactory: AiAgentFactory = () => ({
      prompt: async () => {},
      abort: () => {},
      subscribe: (l) => {
        listener = l;
        return () => {};
      },
    });

    const events: AgentEvent[] = [];
    createAgentSession({
      layer: "chat",
      symbol: "MU.US",
      model: fakeModel,
      systemPrompt: "system prompt",
      tools: [],
      agentFactory,
      onEvent: (event) => events.push(event),
    });

    const event: AgentEvent = { type: "agent_start" };
    listener?.(event);
    expect(events).toEqual([event]);
  });

  it("resolves runTurn when the prompt resolves", async () => {
    const agentFactory: AiAgentFactory = () => ({
      prompt: async () => {},
      abort: () => {},
    });
    const session = createAgentSession({
      layer: "chat",
      symbol: "MU.US",
      model: fakeModel,
      systemPrompt: "system prompt",
      tools: [],
      agentFactory,
    });

    await expect(session.runTurn("hi", 1000)).resolves.toBeUndefined();
    expect(session.isDone()).toBe(true);
  });

  it("rejects with AgentTimeoutError, aborts the agent, and sets isDone on timeout", async () => {
    let aborted = false;
    const agentFactory: AiAgentFactory = () => ({
      prompt: () => new Promise<void>(() => {}),
      abort: () => {
        aborted = true;
      },
    });
    const session = createAgentSession({
      layer: "chat",
      symbol: "MU.US",
      model: fakeModel,
      systemPrompt: "system prompt",
      tools: [],
      agentFactory,
    });

    await expect(session.runTurn("hi", 10)).rejects.toBeInstanceOf(AgentTimeoutError);
    expect(aborted).toBe(true);
    expect(session.isDone()).toBe(true);
  });

  it("supports sequential runTurn calls after a completed turn", async () => {
    const prompts: string[] = [];
    const agentFactory: AiAgentFactory = () => ({
      prompt: async (text: string) => {
        prompts.push(text);
      },
      abort: () => {},
    });
    const session = createAgentSession({
      layer: "chat",
      symbol: "MU.US",
      model: fakeModel,
      systemPrompt: "system prompt",
      tools: [],
      agentFactory,
    });

    await session.runTurn("first", 1000);
    expect(session.isDone()).toBe(true);
    await session.runTurn("second", 1000);
    expect(session.isDone()).toBe(true);
    expect(prompts).toEqual(["first", "second"]);
  });
});
