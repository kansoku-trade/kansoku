import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import { type CockpitComment, type CommentLevel, type NewsItem, type RawBar } from "../../../../shared/types.js";
import { chartUrl } from "../chartUrl.js";
import { JOURNAL_DIR, PROJECT_ROOT, skillSearchDirs } from "../env.js";
import { buildChart } from "../services/build.js";
import { getProvider } from "../services/marketdata/registry.js";
import { validatePrediction } from "../services/predictionRules.js";
import { loadSkillIndex, readSkill } from "../services/skills.js";
import { createChart } from "../services/store.js";
import { AgentTimeoutError, type AiAgentFactory, createAgentSession } from "./agentSession.js";
import { ANALYST_ADAPTER_PROMPT, ANALYST_RETRY_PROMPT } from "./prompts.js";
import { composeWithDiscipline, DisciplineMissingError, loadSharedDiscipline } from "./promptPolicy.js";
import {
  buildBashTool,
  buildReadFileTool,
  buildReadSkillTool,
  createDefaultExec,
  type ExecFn,
} from "./agentTools.js";
import { appendComment as defaultAppendComment } from "./comments.js";
import { buildDataPackTool, buildKlineTool, buildNewsTool, textResult } from "./dataTools.js";
import { buildReassessPack as defaultBuildReassessPack, type ReassessPack } from "./datapack.js";
import type { AiModel } from "./models.js";
import { emitNotice } from "./notices.js";
import { createRunLock } from "./runLock.js";

const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const ESCALATION_COOLDOWN_MS = 30 * 60_000;
const SKILL_NAME = "intraday-signal";

export function buildAnalystSystemPrompt(skillText: string, disciplineText = ""): string {
  return composeWithDiscipline(disciplineText, [ANALYST_ADAPTER_PROMPT, "", "---", "", skillText].join("\n"));
}

function loadIntradaySkillText(repoRoot: string): string | null {
  const index = loadSkillIndex(skillSearchDirs(repoRoot));
  return readSkill(index, SKILL_NAME);
}

function usSessionDate(epochMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(epochMs));
}

const journalSchema = Type.Object({ content: Type.String() });

export function buildJournalTool(
  symbol: string,
  journalDir: string,
  now: () => number,
  onWrite?: () => void,
): AgentTool<typeof journalSchema> {
  const base = symbol.split(".")[0].toUpperCase();
  return {
    name: "write_journal",
    label: "Write Journal",
    description: `按技能 Step 7 写 journal/YYYY-MM-DD-${base}-intraday.md（美东交易日）；同日已存在则追加分节，不覆盖。只提供 markdown 内容。`,
    parameters: journalSchema,
    execute: async (_id, params) => {
      const content = params.content;
      if (!content.trim()) return textResult("rejected: content is empty");
      onWrite?.();
      const file = `${usSessionDate(now())}-${base}-intraday.md`;
      const path = join(journalDir, file);
      await fs.mkdir(journalDir, { recursive: true });
      const existing = await fs.readFile(path, "utf8").catch(() => null);
      const next = existing == null ? content : `${existing.replace(/\n*$/, "")}\n\n---\n\n${content}`;
      await fs.writeFile(path, next, "utf8");
      return textResult(`written to journal/${file}${existing == null ? "" : " (appended)"}`);
    },
  };
}

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

const commentSchema = Type.Object({
  level: Type.Union([Type.Literal("info"), Type.Literal("warn"), Type.Literal("alert")]),
  text: Type.String({ description: "中文白话观察" }),
});

export type CreateChart = (body: Record<string, unknown>) => Promise<{ id: string; url: string }>;

export type AnalystOrigin = "manual" | "escalation";

export interface AnalystDeps {
  model: AiModel;
  agentFactory?: AiAgentFactory;
  buildReassessPack?: (symbol: string) => Promise<ReassessPack>;
  fetchNews?: (symbol: string) => Promise<NewsItem[]>;
  fetchKline?: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  createChart?: CreateChart;
  appendComment?: (comment: CockpitComment) => Promise<void>;
  timeoutMs?: number;
  now?: () => number;
  origin?: AnalystOrigin;
  repoRoot?: string;
  journalDir?: string;
  exec?: ExecFn;
  skillText?: string;
  disciplineText?: string;
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

const analystRunLock = createRunLock();
const analystRunStates = new Map<string, Extract<AnalystRunStatus, { running: true }>>();
const lastEscalationStart = new Map<string, number>();

export type AnalystRunPhase = "preparing" | "researching" | "writing" | "finalizing";

export type AnalystRunStatus =
  | { running: false }
  | {
      running: true;
      origin: AnalystOrigin;
      phase: AnalystRunPhase;
      activity: string;
      startedAt: string;
      updatedAt: string;
    };

export function analystRunStatus(symbol: string): AnalystRunStatus {
  if (!analystRunLock.isLocked(symbol)) return { running: false };
  return analystRunStates.get(symbol) ?? { running: false };
}

function updateAnalystRunStatus(
  symbol: string,
  phase: AnalystRunPhase,
  activity: string,
  now: () => number,
): void {
  const current = analystRunStates.get(symbol);
  if (!current) return;
  analystRunStates.set(symbol, {
    ...current,
    phase,
    activity,
    updatedAt: new Date(now()).toISOString(),
  });
}

export function escalationOnCooldown(symbol: string, now: number): boolean {
  for (const [key, ts] of lastEscalationStart) {
    if (now - ts >= ESCALATION_COOLDOWN_MS) lastEscalationStart.delete(key);
  }
  const last = lastEscalationStart.get(symbol);
  return last != null && now - last < ESCALATION_COOLDOWN_MS;
}

async function defaultCreateChart(body: Record<string, unknown>): Promise<{ id: string; url: string }> {
  const result = await buildChart(body);
  const doc = await createChart(result);
  return { id: doc.id, url: chartUrl(doc) };
}

interface RunState {
  chartId: string | null;
  submitted: boolean;
}

function buildTools(
  symbol: string,
  deps: Required<Pick<AnalystDeps, "createChart" | "appendComment">> & {
    buildReassessPack: (symbol: string) => Promise<ReassessPack>;
    fetchNews: (symbol: string) => Promise<NewsItem[]>;
    fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
    repoRoot: string;
    journalDir: string;
    exec: ExecFn;
    now: () => number;
  },
  state: RunState,
  isDone: () => boolean,
  reportProgress: (phase: AnalystRunPhase, activity: string) => void,
): AgentTool[] {
  const readDataPack = buildDataPackTool(symbol, {
    buildPack: (symbol) => {
      reportProgress("researching", "正在整理多周期行情、资金流与持仓");
      return deps.buildReassessPack(symbol);
    },
    onPack: (pack) => {
      if (pack.prediction_chart_id && state.chartId == null) state.chartId = pack.prediction_chart_id;
    },
  });

  const fetchNewsTool = buildNewsTool(symbol, (symbol) => {
    reportProgress("researching", "正在核对最新消息与催化事件");
    return deps.fetchNews(symbol);
  });
  const fetchKlineTool = buildKlineTool(symbol, (symbol, period, count) => {
    reportProgress("researching", `正在补拉 ${period} K 线`);
    return deps.fetchKline(symbol, period, count);
  });

  const appendCommentTool: AgentTool<typeof commentSchema> = {
    name: "append_comment",
    label: "Append Comment",
    description: "写一条中文白话观察，作为分析员点评记录。",
    parameters: commentSchema,
    execute: async (_id, params) => {
      if (isDone()) return textResult("skipped");
      reportProgress("researching", "正在记录阶段性判断");
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
      if (isDone()) return textResult("skipped", true);
      if (!Check(predictionSchema, params)) {
        return textResult("prediction 结构不合法，请补齐 direction / scenarios（long / short 还需 entry_plan）后重试。");
      }
      const issues = validatePrediction(params);
      if (issues.length) {
        return textResult(`prediction 未通过校验：${issues.join("；")}。请修正后重新调用 submit_prediction。`);
      }
      const { comment, ...prediction } = params;
      reportProgress("finalizing", "正在生成图表并提交最终结论");
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

  const skillIndex = loadSkillIndex(skillSearchDirs(deps.repoRoot));

  return [
    readDataPack,
    fetchNewsTool,
    fetchKlineTool,
    appendCommentTool,
    submitPrediction,
    buildBashTool((command) => {
      reportProgress("researching", "正在补充外部资料与风险信息");
      return deps.exec(command);
    }),
    buildReadSkillTool(skillIndex),
    buildReadFileTool(deps.repoRoot),
    buildJournalTool(symbol, deps.journalDir, deps.now, () =>
      reportProgress("writing", "正在写入本次复盘日志"),
    ),
  ];
}

export async function executeAnalystRun(symbol: string, deps: AnalystDeps): Promise<void> {
  const append = deps.appendComment ?? defaultAppendComment;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? (() => Date.now());
  const reportProgress = (phase: AnalystRunPhase, activity: string) =>
    updateAnalystRunStatus(symbol, phase, activity, now);

  const writeError = (text: string) =>
    append({ ts: new Date().toISOString(), symbol, level: "error", text, source: "system" });

  const state: RunState = { chartId: null, submitted: false };
  let session: ReturnType<typeof createAgentSession> | undefined;

  reportProgress("preparing", "正在加载分析纪律与工具");
  const repoRoot = deps.repoRoot ?? PROJECT_ROOT;
  const skillText = deps.skillText ?? loadIntradaySkillText(repoRoot);
  if (!skillText) {
    await writeError(`${SKILL_NAME} SKILL.md 读不到，重估中止——纪律缺席时不允许裸跑。`);
    return;
  }

  const disciplineText = deps.disciplineText ?? loadSharedDiscipline(repoRoot);
  if (!disciplineText) {
    await writeError(new DisciplineMissingError().message);
    return;
  }

  try {
    const tools = buildTools(
      symbol,
      {
        buildReassessPack: deps.buildReassessPack ?? defaultBuildReassessPack,
        fetchNews: deps.fetchNews ?? ((symbol) => getProvider().getNews(symbol)),
        fetchKline: deps.fetchKline ?? ((symbol, period, count) => getProvider().getKline(symbol, period, count)),
        createChart: deps.createChart ?? defaultCreateChart,
        appendComment: append,
        repoRoot,
        journalDir: deps.journalDir ?? JOURNAL_DIR,
        exec: deps.exec ?? createDefaultExec(repoRoot),
        now,
      },
      state,
      () => session?.isDone() ?? false,
      reportProgress,
    );

    session = createAgentSession({
      layer: "analyst",
      symbol,
      origin: deps.origin,
      model: deps.model,
      systemPrompt: buildAnalystSystemPrompt(skillText, disciplineText),
      tools,
      agentFactory: deps.agentFactory,
    });

    reportProgress("researching", "正在规划分析步骤并读取市场信息");
    await session.runTurn(`请重估 ${symbol} 的短线多周期结论。`, timeoutMs);

    // One explicit retry, mirroring chat/commentator: a rejected submit only returns a tool
    // result, so without an outer nudge the model is free to give up and ship nothing.
    if (!state.submitted && !session.agent.state?.errorMessage) {
      await session.runTurn(ANALYST_RETRY_PROMPT, timeoutMs);
    }

    if (!state.submitted) {
      const errorMessage = session.agent.state?.errorMessage;
      await writeError(errorMessage ? `分析员运行失败：${errorMessage}` : "分析员未提交预测，本次无结论。");
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
      err instanceof AgentTimeoutError
        ? `分析员超时未产出结论（${timeoutMs}ms）。`
        : `分析员运行失败：${err instanceof Error ? err.message : String(err)}`;
    await writeError(text);
  }
}

export function runAnalyst({ symbol, origin, deps }: RunAnalystInput): StartResult {
  if (!analystRunLock.tryAcquire(symbol)) return { started: false, reason: "already running" };

  const now = deps.now ? deps.now() : Date.now();
  if (origin === "escalation" && escalationOnCooldown(symbol, now)) {
    analystRunLock.release(symbol);
    return { started: false, reason: "escalation on cooldown" };
  }

  if (origin === "escalation") lastEscalationStart.set(symbol, now);

  const startedAt = new Date(now).toISOString();
  analystRunStates.set(symbol, {
    running: true,
    origin,
    phase: "preparing",
    activity: "正在准备分析环境",
    startedAt,
    updatedAt: startedAt,
  });

  const done = executeAnalystRun(symbol, { ...deps, origin }).finally(() => {
    analystRunStates.delete(symbol);
    analystRunLock.release(symbol);
  });
  return { started: true, done };
}
