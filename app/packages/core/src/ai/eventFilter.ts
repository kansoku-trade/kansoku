import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { MacroEventItem } from "../../../../shared/types.js";
import { type AiAgentFactory, createAgentSession } from "./agentSession.js";
import { aiConfig } from "./models.js";
import { EVENT_FILTER_PROMPT } from "./prompts.js";

const TIMEOUT_MS = 60_000;

const submitSchema = Type.Object({
  keep: Type.Array(Type.Integer({ minimum: 0 }), { description: "保留事件的 i 序号" }),
});

type SubmitParams = Static<typeof submitSchema>;

export interface EventFilterDeps {
  agentFactory?: AiAgentFactory;
  timeoutMs?: number;
}

export async function filterMacroForSymbol(
  symbol: string,
  items: MacroEventItem[],
  deps: EventFilterDeps = {},
): Promise<MacroEventItem[]> {
  if (!items.length) return items;
  const model = aiConfig().commentModel;
  if (!model) return items;

  let kept: number[] | null = null;
  const tool: AgentTool<typeof submitSchema> = {
    name: "submit_filter",
    label: "Submit Filter",
    description: "提交过滤结果。必须调用恰好一次。",
    parameters: submitSchema,
    execute: async (_id, params: SubmitParams) => {
      kept = params.keep;
      return { content: [{ type: "text", text: "ok" }], details: {}, terminate: true };
    },
  };

  const session = createAgentSession({
    layer: "event-filter",
    symbol,
    model,
    systemPrompt: EVENT_FILTER_PROMPT,
    tools: [tool],
    agentFactory: deps.agentFactory,
  });

  await session.runTurn(
    JSON.stringify({
      symbol,
      events: items.map((e, i) => ({ i, ts: e.ts, title: e.title })),
    }),
    deps.timeoutMs ?? TIMEOUT_MS,
  );

  if (kept === null) return items;
  const keep = new Set<number>(kept);
  return items.filter((_, i) => keep.has(i));
}
