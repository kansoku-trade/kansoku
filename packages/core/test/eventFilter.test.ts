import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MacroEventItem } from "@kansoku/shared/types";
import type { AiAgentFactory, AiAgentHandle } from "../src/ai/agentSession.js";
import { AgentTimeoutError } from "../src/ai/agentSession.js";
import { filterMacroForSymbol } from "../src/ai/eventFilter.js";
import { createSettingsStore, setActiveSettingsStore, type SettingsStore } from "../src/ai/settingsStore.js";
import { createDb } from "../src/db/index.js";

const realModel = builtinModels().getModels("anthropic")[0];

function makeItems(): MacroEventItem[] {
  return [
    { ts: "2026-07-10T12:30:00.000Z", title: "CPI", estimate: null, previous: null },
    { ts: "2026-07-10T14:00:00.000Z", title: "EIA Crude Inventories", estimate: null, previous: null },
  ];
}

describe("filterMacroForSymbol", () => {
  let dir: string;
  let store: SettingsStore;

  function setCommentCustom(): void {
    store.setRole("comment", {
      mode: "custom",
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: "medium",
    });
  }

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    dir = mkdtempSync(join(tmpdir(), "event-filter-"));
    store = createSettingsStore(createDb(join(dir, "app.db")));
    setActiveSettingsStore(store);
  });

  afterEach(() => {
    setActiveSettingsStore(null);
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns items unchanged without calling the agent when items is empty", async () => {
    setCommentCustom();
    const agentFactory: AiAgentFactory = () => {
      throw new Error("agent should not be constructed");
    };
    const result = await filterMacroForSymbol("MU.US", [], { agentFactory });
    expect(result).toEqual([]);
  });

  it("returns items unchanged without calling the agent when commentModel is unset", async () => {
    store.setRole("comment", { mode: "disabled", provider: null, modelId: null, thinkingLevel: null });
    const agentFactory: AiAgentFactory = () => {
      throw new Error("agent should not be constructed");
    };
    const items = makeItems();
    const result = await filterMacroForSymbol("MU.US", items, { agentFactory });
    expect(result).toBe(items);
  });

  it("filters down to the kept indices submitted via submit_filter", async () => {
    setCommentCustom();
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
    setCommentCustom();
    const agentFactory: AiAgentFactory = () => ({
      prompt: () => new Promise<void>(() => {}),
      abort: () => {},
    });

    await expect(
      filterMacroForSymbol("MU.US", makeItems(), { agentFactory, timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(AgentTimeoutError);
  });
});
