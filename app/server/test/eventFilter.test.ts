import { afterEach, describe, expect, it } from "vitest";
import type { MacroEventItem } from "../../shared/types.js";
import type { AiAgentFactory, AiAgentHandle } from "../src/ai/agentSession.js";
import { AgentTimeoutError } from "../src/ai/agentSession.js";
import { filterMacroForSymbol } from "../src/ai/eventFilter.js";

const prevAiCommentModel = process.env.AI_COMMENT_MODEL;

function makeItems(): MacroEventItem[] {
  return [
    { ts: "2026-07-10T12:30:00.000Z", title: "CPI", estimate: null, previous: null },
    { ts: "2026-07-10T14:00:00.000Z", title: "EIA Crude Inventories", estimate: null, previous: null },
  ];
}

describe("filterMacroForSymbol", () => {
  afterEach(() => {
    process.env.AI_COMMENT_MODEL = prevAiCommentModel;
  });

  it("returns items unchanged without calling the agent when items is empty", async () => {
    process.env.AI_COMMENT_MODEL = "anthropic/claude-haiku-4-5";
    const agentFactory: AiAgentFactory = () => {
      throw new Error("agent should not be constructed");
    };
    const result = await filterMacroForSymbol("MU.US", [], { agentFactory });
    expect(result).toEqual([]);
  });

  it("returns items unchanged without calling the agent when commentModel is unset", async () => {
    delete process.env.AI_COMMENT_MODEL;
    const agentFactory: AiAgentFactory = () => {
      throw new Error("agent should not be constructed");
    };
    const items = makeItems();
    const result = await filterMacroForSymbol("MU.US", items, { agentFactory });
    expect(result).toBe(items);
  });

  it("filters down to the kept indices submitted via submit_filter", async () => {
    process.env.AI_COMMENT_MODEL = "anthropic/claude-haiku-4-5";
    const agentFactory: AiAgentFactory = ({ tools }) => {
      const agent: AiAgentHandle = {
        prompt: async () => {
          const tool = tools.find((t) => t.name === "submit_filter");
          await tool?.execute("call-1", { keep: [0] });
        },
        abort: () => {},
      };
      return agent;
    };

    const items = makeItems();
    const result = await filterMacroForSymbol("MU.US", items, { agentFactory });
    expect(result).toEqual([items[0]]);
  });

  it("propagates AgentTimeoutError when the agent never resolves within the injected timeout", async () => {
    process.env.AI_COMMENT_MODEL = "anthropic/claude-haiku-4-5";
    const agentFactory: AiAgentFactory = () => ({
      prompt: () => new Promise<void>(() => {}),
      abort: () => {},
    });

    await expect(
      filterMacroForSymbol("MU.US", makeItems(), { agentFactory, timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(AgentTimeoutError);
  });
});
