import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import { type CockpitComment, type CommentLevel, type NewsItem, type RawBar } from "../../../shared/types.js";
import { chartUrl } from "../chartUrl.js";
import { buildChart } from "../services/build.js";
import { getProvider } from "../services/marketdata/registry.js";
import { createChart } from "../services/store.js";
import { getCodexApiKey } from "./codexAuth.js";
import { appendComment as defaultAppendComment } from "./comments.js";
import { buildReassessPack as defaultBuildReassessPack, type ReassessPack } from "./datapack.js";
import type { AiModel } from "./models.js";
import { emitNotice } from "./notices.js";
import { attachAiUsageLogger } from "./usage.js";

const DEFAULT_TIMEOUT_MS = 600_000;
const ESCALATION_COOLDOWN_MS = 30 * 60_000;
const KLINE_MAX_COUNT = 500;
const KLINE_DEFAULT_COUNT = 200;

const KLINE_PERIODS: Record<string, string> = { m5: "5m", m15: "15m", h1: "1h", day: "day" };

const SYSTEM_PROMPT = [
  "你是短线技术分析员，为单一美股标的做多周期（5 分钟 / 15 分钟 / 1 小时 / 日线）重估。",
  "工作流程：",
  "1. 先调用 read_data_pack 拿到快照（多周期 K 线摘要、资金流、相对成交量、日内关键价位、日线背景 day_context（日线趋势/20 与 50 日均线/近 20 日高低/VWAP）、期权墙 options_levels、教训清单 lessons、大盘参照 SPY/QQQ、新闻、已归档预测、持仓）。",
  "2. 需要时调用 fetch_kline 补拉某个周期的更多 K 线、fetch_news 再拉最新消息。",
  "3. 想边看边记录判断，可调用 append_comment 写一条中文白话观察。",
  "4. 最后必须调用 submit_prediction 恰好一次，给出完整结论并落图。",
  "判读纪律：",
  "- 周期分工：日线定背景（day_context 的趋势与关键位——逆日线的结论要单独说明理由），1 小时定趋势方向，15 分钟定结构与入场，5 分钟只做触发与微调。",
  "- 先定级：快照新闻里有当天能动价的事（财报/指引、政策、行业大消息、已明显砸出行情的新闻）就按催化日处理——消息主导，纯技术面情景的概率封顶 40，必要时直接 neutral；否则按平静日，技术面主导。",
  "- 大盘对齐：对照快照 market 里 SPY/QQQ 的当日方向，逆着大盘的结论必须在 comment 里给一句理由。",
  "- 量能：突破/反转类结论要引用相对成交量 rel_volume 佐证；无量突破按存疑处理，不要当确认信号。",
  "- 期权位：options_levels 是现价附近高持仓行权价（dominant=call 的是上方磁铁/压力，dominant=put 的是下方支撑墙）。止损和目标不要贴着这些价位或整数关口放——那是止损扎堆区，容易被一波冲高/杀低精确扫掉；突破类情景的触发价参照这些墙来定。",
  "- 教训清单：lessons 里每一条都是过去真金白银换来的规则，结论不得重蹈任何一条；有适用条目时在 comment 里点名引用。",
  "- 事件风险：快照没有财报日历——新闻里若见财报/FOMC/CPI 在即，必须写进情景；若无法确认，在 comment 里注明事件风险未核实。",
  "结论纪律（写进 submit_prediction）：",
  "- direction：明确 long / short / neutral。",
  "- anchor：必填，给出判断锚点（哪个周期、时间、价格）——没有锚点的预测事后无法对账。锚点周期默认 m15（观望也是——观望是 15 分钟级别看不出方向的陈述，不要因为盯着 5 分钟 K 线就锚在 m5）；只有纯超短的抢单判断才锚 m5，波段级陈述才锚 h1。时间对齐到该周期的 K 线边界（m15 → :00/:15/:30/:45）。",
  "- entry_plan：只在 long / short 时给出，入场 entry、止损 stop、目标 target1（必填，价格或百分比皆可）/ target2。止损必须依托具体结构（摆动点外沿、123 结构的①、区间边界），在 rationale 里写明是哪个结构；做多止损在入场下方、目标在上方，做空相反。T1 口径盈亏比不足 1:1 的计划不要提交——换结构重做或转 neutral；1:1 到 2:1 之间允许，但必须在 comment 里明说赔率偏薄。",
  "- neutral（观望）不要提交 entry_plan——观望就是现在没有可执行的入场/止损/目标。但必须在 range_plan 里给出箱体下沿 low / 上沿 high（观望 = 预判价格守在这个区间内，事后按守住/破位对账），两侧的条件应对写进 long_tactic / short_tactic。",
  "- scenarios：2 到 4 个情景（通常是上破 / 震荡 / 下破三个，按真实结构给，不要硬凑数量），probability 用 0–100 的百分数，合计约为 100。",
  "- comment：一句话中文白话结论，会作为点评写入。若快照里持仓不为空，comment 必须包含对现有持仓的处置（加 / 减 / 持 / 清）并对照成本价说明理由。",
  "- 不要给仓位建议（股数/金额）——自动重估拿不到账户资金数据，仓位由人工流程决定。",
  "若快照里没有已归档预测，说明这是该标的的首次分析而非重估，照常完成全部流程并给出完整结论。",
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
  probability: Type.Number({ minimum: 0, maximum: 100, description: "0–100 百分数，三者之和约为 100" }),
  trigger: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
});

const rangePlanSchema = Type.Object({
  condition: Type.Optional(Type.String()),
  long_tactic: Type.Optional(Type.String()),
  short_tactic: Type.Optional(Type.String()),
  low: Type.Optional(Type.Number({ description: "箱体下沿（neutral 时必填）" })),
  high: Type.Optional(Type.Number({ description: "箱体上沿（neutral 时必填）" })),
});

const predictionSchema = Type.Object({
  direction: Type.Union([Type.Literal("long"), Type.Literal("short"), Type.Literal("neutral")]),
  anchor: anchorSchema,
  entry_plan: Type.Optional(entryPlanSchema),
  scenarios: Type.Array(scenarioSchema, { minItems: 2, maxItems: 4 }),
  range_plan: Type.Optional(rangePlanSchema),
  comment: Type.String({ description: "一句话中文白话结论，写入点评" }),
});

type PredictionParams = Static<typeof predictionSchema>;

const SCENARIO_SUM_TOLERANCE = 10;
const MIN_T1_RR = 1;

function resolveTarget(
  entry: number,
  direction: "long" | "short",
  target: number | undefined,
  targetPct: number | undefined,
): number | null {
  if (target != null && Number.isFinite(target)) return target;
  if (targetPct != null && Number.isFinite(targetPct)) {
    const sign = direction === "long" ? 1 : -1;
    return entry * (1 + (sign * targetPct) / 100);
  }
  return null;
}

export function validatePrediction(params: PredictionParams): string[] {
  const issues: string[] = [];
  const { direction, entry_plan: plan, scenarios } = params;

  const sum = scenarios.reduce((acc, s) => acc + s.probability, 0);
  if (Math.abs(sum - 100) > SCENARIO_SUM_TOLERANCE) {
    issues.push(`情景概率之和应约为 100（0–100 百分数），当前为 ${sum}`);
  }

  if (direction === "neutral") {
    if (plan) {
      issues.push("neutral（观望）不应提交 entry_plan——去掉入场/止损/目标，两侧条件应对写进 range_plan");
    }
    const rp = params.range_plan;
    if (rp?.low == null || rp?.high == null || !(rp.low < rp.high)) {
      issues.push("neutral 必须在 range_plan 里给出箱体下沿 low / 上沿 high（low < high）——否则观望判断事后无法对账");
    } else if (params.anchor.price < rp.low || params.anchor.price > rp.high) {
      issues.push("观望箱体应包住锚点价格——锚点价在区间外说明区间画错了或方向不该是 neutral");
    }
    return issues;
  }

  if (direction === "long" || direction === "short") {
    if (!plan) {
      issues.push("long / short 必须给出 entry_plan（入场、止损、目标）");
      return issues;
    }
    const { entry, stop } = plan;
    const risk = direction === "long" ? entry - stop : stop - entry;
    if (risk <= 0) {
      issues.push(direction === "long" ? "做多止损必须低于入场价" : "做空止损必须高于入场价");
    }
    const t1 = resolveTarget(entry, direction, plan.target1, plan.target1_pct);
    const t2 = resolveTarget(entry, direction, plan.target2, plan.target2_pct);
    if (t1 == null) {
      issues.push("long / short 必须给出 target1 或 target1_pct——没有目标价就无法核对盈亏比，也无法事后对账");
    } else {
      const reward1 = direction === "long" ? t1 - entry : entry - t1;
      if (reward1 <= 0) {
        issues.push(direction === "long" ? "做多 target1 必须高于入场价" : "做空 target1 必须低于入场价");
      } else if (risk > 0 && reward1 / risk < MIN_T1_RR) {
        issues.push(
          `T1 口径盈亏比 ${(reward1 / risk).toFixed(2)}:1 不足 ${MIN_T1_RR}:1——换结构重做入场/止损，或转 neutral`,
        );
      }
    }
    if (t2 != null) {
      const reward2 = direction === "long" ? t2 - entry : entry - t2;
      if (reward2 <= 0) {
        issues.push(direction === "long" ? "做多 target2 必须高于入场价" : "做空 target2 必须低于入场价");
      }
    }
  }

  return issues;
}

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
  origin?: AnalystOrigin;
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
  for (const [key, ts] of lastEscalationStart) {
    if (now - ts >= ESCALATION_COOLDOWN_MS) lastEscalationStart.delete(key);
  }
  const last = lastEscalationStart.get(symbol);
  return last != null && now - last < ESCALATION_COOLDOWN_MS;
}

const defaultAgentFactory: AnalystAgentFactory = (config) =>
  new Agent({
    getApiKey: getCodexApiKey,
    initialState: {
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
      ...(config.model.thinkingLevel ? { thinkingLevel: config.model.thinkingLevel } : {}),
    },
  });

async function defaultCreateChart(body: Record<string, unknown>): Promise<{ id: string; url: string }> {
  const result = await buildChart(body);
  const doc = await createChart(result);
  return { id: doc.id, url: chartUrl(doc) };
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
    description: "拉取该标的的多周期快照：K 线摘要、资金流、相对成交量、日内关键价位、大盘参照 SPY/QQQ、新闻、已归档预测、持仓。",
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
        return textResult("prediction 结构不合法，请补齐 direction / scenarios（long / short 还需 entry_plan）后重试。");
      }
      const issues = validatePrediction(params);
      if (issues.length) {
        return textResult(`prediction 未通过校验：${issues.join("；")}。请修正后重新调用 submit_prediction。`);
      }
      const { comment, ...prediction } = params;
      const chart = await deps.createChart({
        type: "intraday",
        symbol,
        session: "all",
        origin: "analyst",
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
      fetchNews: deps.fetchNews ?? ((symbol) => getProvider().getNews(symbol)),
      fetchKline: deps.fetchKline ?? ((symbol, period, count) => getProvider().getKline(symbol, period, count)),
      createChart: deps.createChart ?? defaultCreateChart,
      appendComment: append,
    }, state);
    const agent = factory({ systemPrompt: SYSTEM_PROMPT, model: deps.model, tools });
    attachAiUsageLogger(agent, { layer: "analyst", symbol, model: deps.model, origin: deps.origin });

    await runWithTimeout(agent, `请重估 ${symbol} 的短线多周期结论。`, timeoutMs, state);

    if (!state.submitted) {
      await writeError("分析员未提交预测，本次无结论。");
    } else {
      emitNotice({
        symbol,
        kind: "analysis_done",
        title: `${symbol} AI 分析完成`,
        body: "多周期重估已落图，打开 cockpit 查看结论。",
        at: new Date().toISOString(),
      });
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

  const done = executeAnalystRun(symbol, { ...deps, origin }).finally(() => runningAnalysts.delete(symbol));
  return { started: true, done };
}
