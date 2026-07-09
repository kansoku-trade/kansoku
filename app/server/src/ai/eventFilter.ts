import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { MacroEventItem } from "../../../shared/types.js";
import { type AiAgentFactory, createAgentSession } from "./agentSession.js";
import { aiConfig } from "./models.js";

const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = [
  "你是财经事件相关性过滤器。输入是一只美股标的和一批即将发布的美国宏观事件，",
  "任务是只保留对这只标的短线交易真正要紧的事件，其余丢弃。",
  "判断标准：",
  "- 全市场级重磅（CPI、非农、FOMC/利率决议、PCE、GDP、零售销售、ISM/PMI、初请失业金）→ 保留。",
  "- 行业直接相关（如原油库存之于能源股、成屋销售之于建商）→ 保留；对无关行业 → 丢弃。",
  "- 例行碎片（国债竞拍分项、周度库存之于无关行业、次要区域数据）→ 丢弃。",
  "- 同一事件的多个分项只保留信息量最大的一条。",
  "- 拿不准就丢弃——这张卡的价值在于短，宁缺毋滥。",
  "必须调用 submit_filter 恰好一次，keep 为要保留事件的 i 序号数组（可为空数组）。",
].join("\n");

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
    systemPrompt: SYSTEM_PROMPT,
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
