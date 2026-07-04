import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import {
  CURRENT_SCHEMA_VERSION,
  type ChartDoc,
  type CockpitComment,
  type CommentLevel,
  type NewsItem,
  type RawBar,
} from "../../../shared/types.js";
import { BASE_URL } from "../env.js";
import { buildChart } from "../services/build.js";
import { fetchKline as defaultFetchKline, fetchNews as defaultFetchNews } from "../services/longbridge.js";
import { allocateId, saveChart } from "../services/store.js";
import { appendComment as defaultAppendComment } from "./comments.js";
import { buildReassessPack as defaultBuildReassessPack, type ReassessPack } from "./datapack.js";
import type { AiModel } from "./models.js";

const DEFAULT_TIMEOUT_MS = 600_000;
const ESCALATION_COOLDOWN_MS = 30 * 60_000;
const KLINE_MAX_COUNT = 500;
const KLINE_DEFAULT_COUNT = 200;

const KLINE_PERIODS: Record<string, string> = { m5: "5m", m15: "15m", h1: "1h", day: "day" };

const SYSTEM_PROMPT = [
  "你是短线技术分析员，为单一美股标的做多周期（5 分钟 / 15 分钟 / 1 小时 / 日线）重估。",
  "工作流程：",
  "1. 先调用 read_data_pack 拿到快照（多周期 K 线摘要、资金流、已归档预测、持仓）。",
  "2. 需要时调用 fetch_news 看催化消息、fetch_kline 补拉某个周期的更多 K 线。",
  "3. 想边看边记录判断，可调用 append_comment 写一条中文白话观察。",
  "4. 最后必须调用 submit_prediction 恰好一次，给出完整结论并落图。",
  "结论纪律（写进 submit_prediction）：",
  "- direction：明确 long / short / neutral。",
  "- anchor：给出判断锚点（哪个周期、时间、价格）。",
  "- entry_plan：给出入场价 entry、止损 stop、目标 target1 / target2。方向决定止损在上还是在下。",
  "- scenarios：给出三个情景（如上破 / 震荡 / 下破），每个带概率 probability，三者概率之和为 1。",
  "- comment：一句话中文白话结论，会作为点评写入。",
  "全程中文白话，只做美股，不要臆造数据，拿不到就说明。",
].join("\n");

const anchorSchema = Type.Object({
  timeframe: Type.Union([Type.Literal("m5"), Type.Literal("m15"), Type.Literal("h1")]),
  time: Type.String(),
  price: Type.Number(),
});

const entryPlanSchema = Type.Object({
  entry: Type.Number(),
  stop: Type.Number(),
  target1: Type.Optional(Type.Number()),
  target2: Type.Optional(Type.Number()),
  target1_pct: Type.Optional(Type.Number()),
  target2_pct: Type.Optional(Type.Number()),
  note: Type.Optional(Type.String()),
  rationale: Type.Optional(Type.String()),
});

const scenarioSchema = Type.Object({
  label: Type.String(),
  probability: Type.Number(),
  trigger: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
});

const rangePlanSchema = Type.Object({
  condition: Type.Optional(Type.String()),
  long_tactic: Type.Optional(Type.String()),
  short_tactic: Type.Optional(Type.String()),
});

const predictionSchema = Type.Object({
  direction: Type.Union([Type.Literal("long"), Type.Literal("short"), Type.Literal("neutral")]),
  anchor: Type.Optional(anchorSchema),
  entry_plan: entryPlanSchema,
  scenarios: Type.Array(scenarioSchema, { minItems: 1 }),
  range_plan: Type.Optional(rangePlanSchema),
  comment: Type.String({ description: "一句话中文白话结论，写入点评" }),
});

type PredictionParams = Static<typeof predictionSchema>;

const klineSchema = Type.Object({
  period: Type.Union([Type.Literal("m5"), Type.Literal("m15"), Type.Literal("h1"), Type.Literal("day")]),
  count: Type.Optional(Type.Number()),
});

const commentSchema = Type.Object({
  level: Type.Union([Type.Literal("info"), Type.Literal("warn"), Type.Literal("alert")]),
  text: Type.String({ description: "中文白话观察" }),
});

export interface AnalystAgent {
  prompt(text: string): Promise<unknown>;
  abort(): void;
}

export type AnalystAgentFactory = (config: {
  systemPrompt: string;
  model: AiModel;
  tools: AgentTool[];
}) => AnalystAgent;

export type CreateChart = (body: Record<string, unknown>) => Promise<{ id: string; url: string }>;

export type AnalystOrigin = "manual" | "escalation";

export interface AnalystDeps {
  model: AiModel;
  agentFactory?: AnalystAgentFactory;
  buildReassessPack?: (symbol: string) => Promise<ReassessPack>;
  fetchNews?: (symbol: string) => Promise<NewsItem[]>;
  fetchKline?: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  createChart?: CreateChart;
  appendComment?: (comment: CockpitComment) => Promise<void>;
  timeoutMs?: number;
  now?: () => number;
}

export interface RunAnalystInput {
  symbol: string;
  origin: AnalystOrigin;
  deps: AnalystDeps;
}

export interface StartResult {
  started: boolean;
  reason?: string;
  done?: Promise<void>;
}

const runningAnalysts = new Set<string>();
const lastEscalationStart = new Map<string, number>();

export function escalationOnCooldown(symbol: string, now: number): boolean {
  const last = lastEscalationStart.get(symbol);
  return last != null && now - last < ESCALATION_COOLDOWN_MS;
}

const defaultAgentFactory: AnalystAgentFactory = (config) =>
  new Agent({
    initialState: {
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
    },
  });

async function defaultCreateChart(body: Record<string, unknown>): Promise<{ id: string; url: string }> {
  const result = await buildChart(body);
  const id = await allocateId(result.sessionDate, result.slug);
  const now = new Date().toISOString();
  const doc: ChartDoc = {
    id,
    schema_version: CURRENT_SCHEMA_VERSION,
    type: result.type,
    title: result.title,
    symbol: result.symbol,
    created_at: now,
    updated_at: now,
    input: result.input,
    built: result.built,
  };
  await saveChart(doc);
  return { id, url: `${BASE_URL}/#/charts/${encodeURIComponent(id)}` };
}

interface RunState {
  done: boolean;
  chartId: string | null;
  submitted: boolean;
}

class AnalystTimeoutError extends Error {}

function clampCount(count: number | undefined): number {
  if (count == null || !Number.isFinite(count)) return KLINE_DEFAULT_COUNT;
  return Math.max(1, Math.min(KLINE_MAX_COUNT, Math.floor(count)));
}

function textResult(text: string, terminate = false) {
  return { content: [{ type: "text" as const, text }], details: {}, terminate };
}

function buildTools(
  symbol: string,
  deps: Required<Pick<AnalystDeps, "createChart" | "appendComment">> & {
    buildReassessPack: (symbol: string) => Promise<ReassessPack>;
    fetchNews: (symbol: string) => Promise<NewsItem[]>;
    fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  },
  state: RunState,
): AgentTool[] {
  let cachedPack: ReassessPack | null = null;

  const readDataPack: AgentTool = {
    name: "read_data_pack",
    label: "Read Data Pack",
    description: "拉取该标的的多周期快照：K 线摘要、资金流、已归档预测、持仓。",
    parameters: Type.Object({}),
    execute: async () => {
      cachedPack = cachedPack ?? (await deps.buildReassessPack(symbol));
      if (cachedPack.prediction_chart_id && state.chartId == null) {
        state.chartId = cachedPack.prediction_chart_id;
      }
      return textResult(JSON.stringify(cachedPack));
    },
  };

  const fetchNewsTool: AgentTool = {
    name: "fetch_news",
    label: "Fetch News",
    description: "拉取该标的最近的新闻与催化消息。",
    parameters: Type.Object({}),
    execute: async () => textResult(JSON.stringify(await deps.fetchNews(symbol))),
  };

  const fetchKlineTool: AgentTool<typeof klineSchema> = {
    name: "fetch_kline",
    label: "Fetch K-line",
    description: "补拉某个周期的 K 线。period 限 m5/m15/h1/day，count 上限 500。",
    parameters: klineSchema,
    execute: async (_id, params) => {
      const period = KLINE_PERIODS[params.period];
      const count = clampCount(params.count);
      const bars = await deps.fetchKline(symbol, period, count);
      return textResult(JSON.stringify({ period: params.period, count, bars }));
    },
  };

  const appendCommentTool: AgentTool<typeof commentSchema> = {
    name: "append_comment",
    label: "Append Comment",
    description: "写一条中文白话观察，作为分析员点评记录。",
    parameters: commentSchema,
    execute: async (_id, params) => {
      if (state.done) return textResult("skipped");
      await deps.appendComment({
        ts: new Date().toISOString(),
        symbol,
        level: params.level as CommentLevel,
        text: params.text,
        source: "analyst",
        ...(state.chartId ? { chartId: state.chartId } : {}),
      });
      return textResult("recorded");
    },
  };

  const submitPrediction: AgentTool<typeof predictionSchema> = {
    name: "submit_prediction",
    label: "Submit Prediction",
    description: "提交完整结论并落图。收齐研究后调用且只调用一次。",
    parameters: predictionSchema,
    execute: async (_id, params: PredictionParams) => {
      if (state.done) return textResult("skipped", true);
      if (!Check(predictionSchema, params)) {
        return textResult("prediction 结构不合法，请补齐 direction / entry_plan / scenarios 后重试。");
      }
      const { comment, ...prediction } = params;
      const chart = await deps.createChart({
        type: "intraday",
        symbol,
        session: "all",
        prediction,
      });
      state.chartId = chart.id;
      state.submitted = true;
      await deps.appendComment({
        ts: new Date().toISOString(),
        symbol,
        level: "info",
        text: comment,
        source: "analyst",
        chartId: chart.id,
      });
      return textResult(JSON.stringify({ chartId: chart.id, url: chart.url }), true);
    },
  };

  return [readDataPack, fetchNewsTool, fetchKlineTool, appendCommentTool, submitPrediction];
}

async function runWithTimeout(
  agent: AnalystAgent,
  prompt: string,
  timeoutMs: number,
  state: RunState,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state.done) return;
      state.done = true;
      agent.abort();
      reject(new AnalystTimeoutError(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    agent.prompt(prompt).then(
      () => {
        if (state.done) return;
        state.done = true;
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        if (state.done) return;
        state.done = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export async function executeAnalystRun(symbol: string, deps: AnalystDeps): Promise<void> {
  const factory = deps.agentFactory ?? defaultAgentFactory;
  const append = deps.appendComment ?? defaultAppendComment;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const writeError = (text: string) =>
    append({ ts: new Date().toISOString(), symbol, level: "error", text, source: "system" });

  const state: RunState = { done: false, chartId: null, submitted: false };

  try {
    const tools = buildTools(symbol, {
      buildReassessPack: deps.buildReassessPack ?? defaultBuildReassessPack,
      fetchNews: deps.fetchNews ?? defaultFetchNews,
      fetchKline: deps.fetchKline ?? defaultFetchKline,
      createChart: deps.createChart ?? defaultCreateChart,
      appendComment: append,
    }, state);
    const agent = factory({ systemPrompt: SYSTEM_PROMPT, model: deps.model, tools });

    await runWithTimeout(agent, `请重估 ${symbol} 的短线多周期结论。`, timeoutMs, state);

    if (!state.submitted) {
      await writeError("分析员未提交预测，本次无结论。");
    }
  } catch (err) {
    const text =
      err instanceof AnalystTimeoutError
        ? `分析员超时未产出结论（${timeoutMs}ms）。`
        : `分析员运行失败：${err instanceof Error ? err.message : String(err)}`;
    await writeError(text);
  }
}

export function runAnalyst({ symbol, origin, deps }: RunAnalystInput): StartResult {
  if (runningAnalysts.has(symbol)) return { started: false, reason: "already running" };

  const now = deps.now ? deps.now() : Date.now();
  if (origin === "escalation" && escalationOnCooldown(symbol, now)) {
    return { started: false, reason: "escalation on cooldown" };
  }

  runningAnalysts.add(symbol);
  if (origin === "escalation") lastEscalationStart.set(symbol, now);

  const done = executeAnalystRun(symbol, deps).finally(() => runningAnalysts.delete(symbol));
  return { started: true, done };
}
