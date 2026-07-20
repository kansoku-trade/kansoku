import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { type Static, Type } from 'typebox';
import { Check } from 'typebox/value';
import {
  type CockpitComment,
  type CommentLevel,
  type IntradayPrediction,
  type NewsItem,
  type RawBar,
} from '@kansoku/shared/types';
import type { ReassessPhase, ReassessResult, ReassessStatus } from '../contract/symbols.js';
import { chartUrl } from '../chartUrl.js';
import { JOURNAL_DIR, PROJECT_ROOT, skillSearchDirs } from '../env.js';
import { buildChart } from '../services/build.js';
import { getProvider } from '../services/marketdata/registry.js';
import { marketOf } from '../services/symbol.utils.js';
import { validatePrediction } from '../services/predictionRules.js';
import { loadSkillIndex, readSkill, type SkillMeta } from '../services/skills.js';
import { createChart } from '../services/store.js';
import { prepareProAiTurn } from '../pro/aiExtension.js';
import { AgentTimeoutError, type AiAgentFactory, createAgentSession } from './agentSession.js';
import {
  AnalystMessagesEngine,
  type AnalystSkillContext,
} from './messages/analystMessagesEngine.js';
import { ANALYST_ADAPTER_PROMPT, ANALYST_RETRY_PROMPT, ANALYST_SYSTEM_PROMPT } from './prompts.js';
import {
  DISCIPLINE_SKILL,
  DisciplineMissingError,
  loadAppDiscipline,
} from './promptPolicy.js';
import {
  buildResearchTools,
  createDefaultExec,
  type ExecFn,
  type FsReadMount,
} from './agentTools.js';
import { appendComment as defaultAppendComment } from './comments.js';
import { buildDataPackTool, buildKlineTool, buildNewsTool, textResult } from './dataTools.js';
import { buildReassessPack as defaultBuildReassessPack, type ReassessPack } from './datapack.js';
import { aiConfig, type AiModel } from './models.js';
import { emitNotice } from './notices.js';
import { createRunLock } from './runLock.js';

const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const ESCALATION_COOLDOWN_MS = 30 * 60_000;
const SKILL_NAME = 'intraday-signal';

export function buildAnalystSystemPrompt(): string {
  return ANALYST_SYSTEM_PROMPT;
}

export function usSessionDate(epochMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(epochMs),
  );
}

const journalSchema = Type.Object({ content: Type.String() });

export function buildJournalTool(
  symbol: string,
  journalDir: string,
  now: () => number,
  onWritten?: () => void,
): AgentTool<typeof journalSchema> {
  const base = symbol.split('.')[0].toUpperCase();
  return {
    name: 'write_journal',
    label: 'Write Journal',
    description: `Write journal/YYYY-MM-DD-${base}-intraday.md according to Skill Step 7 and the US Eastern trading date. Append a section when the same-day file exists; never overwrite it. Provide Markdown content only.`,
    parameters: journalSchema,
    execute: async (_id, params) => {
      const content = params.content;
      if (!content.trim()) return textResult('rejected: content is empty');
      const file = `${usSessionDate(now())}-${base}-intraday.md`;
      const path = join(journalDir, file);
      await fs.mkdir(journalDir, { recursive: true });
      const existing = await fs.readFile(path, 'utf8').catch(() => null);
      const next =
        existing == null ? content : `${existing.replace(/\n*$/, '')}\n\n---\n\n${content}`;
      await fs.writeFile(path, next, 'utf8');
      onWritten?.();
      return textResult(`written to journal/${file}${existing == null ? '' : ' (appended)'}`);
    },
  };
}

const anchorSchema = Type.Object({
  timeframe: Type.Union([
    Type.Literal('m5'),
    Type.Literal('m15'),
    Type.Literal('h1'),
    Type.Literal('day'),
  ]),
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
  probability: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'A percentage from 0 to 100; the three scenario probabilities should sum to approximately 100.',
  }),
  trigger: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
});

const rangePlanSchema = Type.Object({
  condition: Type.Optional(Type.String()),
  long_tactic: Type.Optional(Type.String()),
  short_tactic: Type.Optional(Type.String()),
  low: Type.Optional(Type.Number({ description: 'Lower bound of the range; required for neutral.' })),
  high: Type.Optional(Type.Number({ description: 'Upper bound of the range; required for neutral.' })),
});

const predictionSchema = Type.Object({
  direction: Type.Union([Type.Literal('long'), Type.Literal('short'), Type.Literal('neutral')]),
  anchor: anchorSchema,
  entry_plan: Type.Optional(entryPlanSchema),
  scenarios: Type.Array(scenarioSchema, { minItems: 2, maxItems: 4 }),
  range_plan: Type.Optional(rangePlanSchema),
  comment: Type.String({ description: 'A one-sentence plain-language conclusion to store as a comment.' }),
});

type PredictionParams = Static<typeof predictionSchema>;

const commentSchema = Type.Object({
  level: Type.Union([Type.Literal('info'), Type.Literal('warn'), Type.Literal('alert')]),
  text: Type.String({ description: 'A plain-language observation.' }),
});

export type CreateChart = (body: Record<string, unknown>) => Promise<{ id: string; url: string }>;

export type AnalystOrigin = 'manual' | 'escalation';

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

export type StartResult =
  | { started: false; reason: 'already running' | 'escalation on cooldown' }
  | { started: true; done: Promise<void> };

type RunningAnalystRunStatus = Extract<ReassessStatus, { running: true }>;

const analystRunLock = createRunLock();
const analystRunStates = new Map<string, RunningAnalystRunStatus>();
const lastEscalationStart = new Map<string, number>();
const analystRunListeners = new Set<(symbol: string, status: ReassessStatus) => void>();

export function analystRunStatus(symbol: string): ReassessStatus {
  if (!analystRunLock.isLocked(symbol)) return { running: false };
  return analystRunStates.get(symbol) ?? { running: false };
}

export function listAnalystRuns(): Array<{ symbol: string; status: RunningAnalystRunStatus }> {
  return [...analystRunStates.entries()].map(([symbol, status]) => ({ symbol, status }));
}

export function onAnalystRunChange(
  listener: (symbol: string, status: ReassessStatus) => void,
): () => void {
  analystRunListeners.add(listener);
  return () => analystRunListeners.delete(listener);
}

function emitAnalystRunChange(symbol: string, status: ReassessStatus): void {
  for (const listener of analystRunListeners) {
    try {
      listener(symbol, status);
    } catch {
      continue;
    }
  }
}

function updateAnalystRunStatus(
  symbol: string,
  phase: ReassessPhase,
  activity: string,
  now: () => number,
): void {
  const current = analystRunStates.get(symbol);
  if (!current) return;
  const next: RunningAnalystRunStatus = {
    ...current,
    phase,
    activity,
    updatedAt: new Date(now()).toISOString(),
  };
  analystRunStates.set(symbol, next);
  emitAnalystRunChange(symbol, next);
}

export function escalationOnCooldown(symbol: string, now: number): boolean {
  for (const [key, ts] of lastEscalationStart) {
    if (now - ts >= ESCALATION_COOLDOWN_MS) lastEscalationStart.delete(key);
  }
  const last = lastEscalationStart.get(symbol);
  return last != null && now - last < ESCALATION_COOLDOWN_MS;
}

async function defaultCreateChart(
  body: Record<string, unknown>,
): Promise<{ id: string; url: string }> {
  const result = await buildChart(body);
  const doc = await createChart(result);
  return { id: doc.id, url: chartUrl(doc) };
}

interface RunState {
  chartId: string | null;
  journalWritten: boolean;
  loadedSkillIds: Set<string>;
  submitted: boolean;
}

export function buildAnalystSkillContexts(
  skillIndex: SkillMeta[],
  skillText: string,
  disciplineText: string,
): AnalystSkillContext[] {
  const activated = new Map<string, { content: string; fallbackDescription: string }>([
    [
      DISCIPLINE_SKILL,
      {
        content: disciplineText,
        fallbackDescription: 'Shared discipline and data boundaries for every trading judgment.',
      },
    ],
    [
      SKILL_NAME,
      {
        content: skillText,
        fallbackDescription: 'Multi-period direction, scenarios, and trade-plan analysis for one symbol across intraday to several trading days.',
      },
    ],
  ]);
  const skills: AnalystSkillContext[] = skillIndex.map((skill) => ({
    activated: activated.has(skill.name),
    content: activated.get(skill.name)?.content,
    description: skill.description,
    location: join(skill.dir, 'SKILL.md'),
    name: skill.name,
  }));
  const known = new Set(skills.map((skill) => skill.name));
  for (const [name, entry] of activated) {
    if (known.has(name)) continue;
    skills.push({
      activated: true,
      content: entry.content,
      description: entry.fallbackDescription,
      name,
    });
  }
  const priority = (name: string) => (name === DISCIPLINE_SKILL ? 0 : name === SKILL_NAME ? 1 : 2);
  return skills.sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name));
}

export interface SubmitPredictionHooks {
  createChart: CreateChart;
  appendComment: (comment: CockpitComment) => Promise<void>;
  isDone: () => boolean;
  reportProgress?: (phase: ReassessPhase, activity: string) => void;
  onSubmitted?: (chartId: string, params: PredictionParams) => void;
}

export function buildSubmitPredictionTool(
  symbol: string,
  hooks: SubmitPredictionHooks,
): AgentTool<typeof predictionSchema> {
  return {
    name: 'submit_prediction',
    label: 'Submit Prediction',
    description: 'Submit the complete conclusion and create the chart. Call exactly once after research is complete.',
    parameters: predictionSchema,
    execute: async (_id, params: PredictionParams) => {
      if (hooks.isDone()) return textResult('skipped', true);
      if (!Check(predictionSchema, params)) {
        return textResult(
          'prediction has an invalid structure. Add direction and scenarios; long and short also require entry_plan. Then retry.',
        );
      }
      const issues = validatePrediction(params as unknown as IntradayPrediction);
      if (issues.length) {
        return textResult(
          `prediction failed validation: ${issues.join('; ')}. Correct it and call submit_prediction again.`,
        );
      }
      const { comment, ...prediction } = params;
      hooks.reportProgress?.('finalizing', '正在生成图表并提交最终结论');
      const chart = await hooks.createChart({
        type: 'intraday',
        symbol,
        session: 'all',
        origin: 'analyst',
        prediction,
      });
      hooks.onSubmitted?.(chart.id, params);
      await hooks.appendComment({
        ts: new Date().toISOString(),
        symbol,
        level: 'info',
        text: comment,
        source: 'analyst',
        chartId: chart.id,
      });
      return textResult(JSON.stringify({ chartId: chart.id, url: chart.url }), true);
    },
  };
}

function buildTools(
  symbol: string,
  deps: Required<Pick<AnalystDeps, 'createChart' | 'appendComment'>> & {
    buildReassessPack: (symbol: string) => Promise<ReassessPack>;
    fetchNews: (symbol: string) => Promise<NewsItem[]>;
    fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
    repoRoot: string;
    journalDir: string;
    exec: ExecFn;
    now: () => number;
    skillIndex: SkillMeta[];
    readMounts: FsReadMount[];
  },
  state: RunState,
  isDone: () => boolean,
  reportProgress: (phase: ReassessPhase, activity: string) => void,
): AgentTool[] {
  const readDataPack = buildDataPackTool(symbol, {
    buildPack: (symbol) => {
      reportProgress('researching', '正在整理多周期行情、资金流与持仓');
      return deps.buildReassessPack(symbol);
    },
    onPack: (pack) => {
      if (pack.prediction_chart_id && state.chartId == null)
        state.chartId = pack.prediction_chart_id;
    },
  });

  const fetchNewsTool = buildNewsTool(symbol, (symbol) => {
    reportProgress('researching', '正在核对最新消息与催化事件');
    return deps.fetchNews(symbol);
  });
  const fetchKlineTool = buildKlineTool(symbol, (symbol, period, count) => {
    reportProgress('researching', `正在补拉 ${period} K 线`);
    return deps.fetchKline(symbol, period, count);
  });

  const appendCommentTool: AgentTool<typeof commentSchema> = {
    name: 'append_comment',
    label: 'Append Comment',
    description: 'Write one plain-language observation as an analyst comment.',
    parameters: commentSchema,
    execute: async (_id, params) => {
      if (isDone()) return textResult('skipped');
      reportProgress('researching', '正在记录阶段性判断');
      await deps.appendComment({
        ts: new Date().toISOString(),
        symbol,
        level: params.level as CommentLevel,
        text: params.text,
        source: 'analyst',
        ...(state.chartId ? { chartId: state.chartId } : {}),
      });
      return textResult('recorded');
    },
  };

  const submitPrediction = buildSubmitPredictionTool(symbol, {
    createChart: deps.createChart,
    appendComment: deps.appendComment,
    isDone,
    reportProgress,
    onSubmitted: (chartId) => {
      state.chartId = chartId;
      state.submitted = true;
    },
  });

  const researchTools = buildResearchTools({
    repoRoot: deps.repoRoot,
    exec: (command) => {
      reportProgress('researching', '正在补充外部资料与风险信息');
      return deps.exec(command);
    },
    skillIndex: deps.skillIndex,
    onSkillRead: (name) => state.loadedSkillIds.add(name),
    readMounts: deps.readMounts,
  }).tools;

  return [
    readDataPack,
    fetchNewsTool,
    fetchKlineTool,
    appendCommentTool,
    submitPrediction,
    ...researchTools,
    buildJournalTool(symbol, deps.journalDir, deps.now, () => {
      state.journalWritten = true;
      reportProgress('writing', '正在写入本次复盘日志');
    }),
  ];
}

export async function executeAnalystRun(symbol: string, deps: AnalystDeps): Promise<void> {
  const append = deps.appendComment ?? defaultAppendComment;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? (() => Date.now());
  const reportProgress = (phase: ReassessPhase, activity: string) =>
    updateAnalystRunStatus(symbol, phase, activity, now);

  const writeError = (text: string) =>
    append({ ts: new Date().toISOString(), symbol, level: 'error', text, source: 'system' });

  const state: RunState = {
    chartId: null,
    journalWritten: false,
    loadedSkillIds: new Set(),
    submitted: false,
  };
  let session: ReturnType<typeof createAgentSession> | undefined;

  reportProgress('preparing', '正在加载分析纪律与工具');
  const repoRoot = deps.repoRoot ?? PROJECT_ROOT;
  const skillIndex = loadSkillIndex(skillSearchDirs(repoRoot));
  const skillText = deps.skillText ?? readSkill(skillIndex, SKILL_NAME);
  if (!skillText) {
    await writeError(`${SKILL_NAME} SKILL.md 读不到，重估中止——纪律缺席时不允许裸跑。`);
    return;
  }

  const disciplineText = deps.disciplineText ?? (loadAppDiscipline(repoRoot) ?? '');
  if (!disciplineText) {
    await writeError(new DisciplineMissingError().message);
    return;
  }

  try {
    const runStartedAt = now();
    reportProgress('researching', '正在整理多周期行情、资金流与持仓');
    const dataPack = await (deps.buildReassessPack ?? defaultBuildReassessPack)(symbol);
    if (dataPack.prediction_chart_id) state.chartId = dataPack.prediction_chart_id;
    const sessionId = `analyst:${symbol}:${runStartedAt}`;
    const proTurn = await prepareProAiTurn({
      surface: 'analyst',
      sessionId,
      symbol,
      market: marketOf(symbol),
    });

    const tools = buildTools(
      symbol,
      {
        buildReassessPack: async () => dataPack,
        fetchNews: deps.fetchNews ?? ((symbol) => getProvider(marketOf(symbol)).getNews(symbol)),
        fetchKline:
          deps.fetchKline ??
          ((symbol, period, count) =>
            getProvider(marketOf(symbol)).getKline(symbol, period, count)),
        createChart: deps.createChart ?? defaultCreateChart,
        appendComment: append,
        repoRoot,
        journalDir: deps.journalDir ?? JOURNAL_DIR,
        exec: deps.exec ?? createDefaultExec(repoRoot),
        now,
        skillIndex,
        readMounts: proTurn.readMounts,
      },
      state,
      () => session?.isDone() ?? false,
      reportProgress,
    );

    const messagesEngine = new AnalystMessagesEngine({
      initialContext: {
        dataPack,
        marketDate: usSessionDate(runStartedAt),
        origin: deps.origin,
        runtimeAdapter: ANALYST_ADAPTER_PROMPT,
        skills: buildAnalystSkillContexts(skillIndex, skillText, disciplineText),
        startedAt: new Date(runStartedAt).toISOString(),
        symbol,
      },
      stepContext: () => ({
        chartId: state.chartId,
        journalWritten: state.journalWritten,
        loadedSkillIds: [...state.loadedSkillIds].sort(),
        submitted: state.submitted,
      }),
      extraProcessors: proTurn.processors,
    });

    session = createAgentSession({
      layer: 'analyst',
      symbol,
      origin: deps.origin,
      model: deps.model,
      systemPrompt: buildAnalystSystemPrompt(),
      tools,
      sessionId,
      transformContext: async (messages) => (await messagesEngine.process(messages)).messages,
      agentFactory: deps.agentFactory,
    });

    reportProgress('researching', '正在规划分析步骤并读取市场信息');
    await session.runTurn(`Reassess the short-term multi-period conclusion for ${symbol}.`, timeoutMs);

    // One explicit retry, mirroring chat/commentator: a rejected submit only returns a tool
    // result, so without an outer nudge the model is free to give up and ship nothing.
    if (!state.submitted && !session.agent.state?.errorMessage) {
      await session.runTurn(ANALYST_RETRY_PROMPT, timeoutMs);
    }
    proTurn.onTurnComplete?.(session.agent.state?.messages ?? []);

    if (!state.submitted) {
      const errorMessage = session.agent.state?.errorMessage;
      await writeError(
        errorMessage ? `分析员运行失败：${errorMessage}` : '分析员未提交预测，本次无结论。',
      );
    } else {
      emitNotice({
        symbol,
        kind: 'analysis_done',
        title: `${symbol} AI 分析完成`,
        body: '多周期重估已落图，打开 cockpit 查看结论。',
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
  if (!analystRunLock.tryAcquire(symbol)) return { started: false, reason: 'already running' };

  const now = deps.now ? deps.now() : Date.now();
  if (origin === 'escalation' && escalationOnCooldown(symbol, now)) {
    analystRunLock.release(symbol);
    return { started: false, reason: 'escalation on cooldown' };
  }

  if (origin === 'escalation') lastEscalationStart.set(symbol, now);

  const startedAt = new Date(now).toISOString();
  const initialStatus: RunningAnalystRunStatus = {
    running: true,
    origin,
    phase: 'preparing',
    activity: '正在准备分析环境',
    startedAt,
    updatedAt: startedAt,
  };
  analystRunStates.set(symbol, initialStatus);
  emitAnalystRunChange(symbol, initialStatus);

  const done = executeAnalystRun(symbol, { ...deps, origin }).finally(() => {
    analystRunStates.delete(symbol);
    analystRunLock.release(symbol);
    emitAnalystRunChange(symbol, { running: false });
  });
  return { started: true, done };
}

export async function reassessSymbol(symbol: string): Promise<ReassessResult> {
  const model = aiConfig().analystModel;
  if (!model) return { started: false, reason: 'analyst layer disabled' };
  const result = runAnalyst({ symbol, origin: 'manual', deps: { model } });
  if (result.started) {
    void result.done.catch(() => {});
    return { started: true };
  }
  return { started: false, reason: result.reason };
}
