import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { ReassessPhase, ReassessResult } from '../../../contract/symbols.js';
import { JOURNAL_DIR, PROJECT_ROOT, skillSearchDirs } from '../../../platform/env.js';
import { getProvider } from '../../../marketdata/registry.js';
import { marketOf } from '../../../symbols/symbol.utils.js';
import { loadSkillIndex, readSkill } from '../../agents/skills.js';
import { prepareProAiTurn } from '../../../pro/aiExtension.js';
import { AgentTimeoutError, createAgentSession } from '../../agents/agentSession.js';
import { AnalystMessagesEngine } from '../../conversation/messages/analystMessagesEngine.js';
import { ANALYST_ADAPTER_PROMPT, ANALYST_RETRY_PROMPT, ANALYST_SYSTEM_PROMPT } from '../../runtime/prompts.js';
import { DisciplineMissingError, loadAppDiscipline } from '../../runtime/promptPolicy.js';
import { createDefaultExec } from '../../agents/agentTools/execTool.js';
import { appendComment as defaultAppendComment } from '../comments.js';
import { buildReassessPack as defaultBuildReassessPack } from '../../agents/datapack.js';
import { aiConfig } from '../../runtime/models.js';
import { emitNotice } from '../notices.js';
import {
  analystRunLock,
  analystRunStates,
  appendAnalystActivity,
  emitAnalystRunChange,
  escalationOnCooldown,
  lastEscalationStart,
  updateAnalystRunStatus,
} from './runState.js';
import { describeToolCall, describeTurnStart } from './activity.js';
import {
  buildAnalystSkillContexts,
  buildTools,
  defaultCreateChart,
  SKILL_NAME,
  usSessionDate,
  type RunState,
} from './tools.js';
import type { AnalystDeps, RunAnalystInput, RunningAnalystRunStatus, StartResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 15 * 60_000;

export function buildAnalystSystemPrompt(): string {
  return ANALYST_SYSTEM_PROMPT;
}

export async function executeAnalystRun(symbol: string, deps: AnalystDeps): Promise<void> {
  const append = deps.appendComment ?? defaultAppendComment;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? (() => Date.now());
  const reportProgress = (phase: ReassessPhase, activity: string) =>
    updateAnalystRunStatus(symbol, phase, activity, now);

  const writeError = (text: string) =>
    append({ ts: new Date().toISOString(), symbol, level: 'error', text, source: 'system' });

  let turnNumber = 0;
  const onAgentEvent = (event: AgentEvent) => {
    try {
      if (event.type === 'turn_start') {
        turnNumber += 1;
        appendAnalystActivity(symbol, describeTurnStart(turnNumber), now);
      } else if (event.type === 'tool_execution_start') {
        appendAnalystActivity(symbol, describeToolCall(event.toolName, event.args), now);
      }
    } catch {}
  };

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
      onEvent: onAgentEvent,
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
    activities: [],
    sections: {},
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
