import { randomUUID } from 'node:crypto';
import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import type {
  Annotation,
  ChartDoc,
  CockpitComment,
  IntradayPrediction,
  NewsItem,
  RawBar,
} from '@kansoku/shared/types';
import { PROJECT_ROOT } from '../platform/env.js';
import { annotationsService } from '../charts/annotations.service.js';
import { getProvider } from '../marketdata/registry.js';
import { marketOf } from '../symbols/symbol.utils.js';
import { easternDate } from '../marketdata/session.js';
import { loadChart as defaultLoadChart } from '../charts/store.js';
import type { AiAgentFactory } from './agentSession.js';
import { buildResearchTools, type ExecFn } from './agentTools.js';
import {
  appendMessages,
  type ChatMessageRow,
  createSession,
  getSessionByChartId,
  listMessages,
} from './chatStore.js';
import { listComments as defaultListComments } from './comments.js';
import {
  type ConversationEvent,
  type ConversationPreparedTurn,
  createConversationEngine,
} from './conversationEngine.js';
import { stringifyPayload, textOf } from './conversationShared.js';
import {
  buildDataPackTool,
  buildDrawAnnotationsTool,
  buildKlineTool,
  buildNewsTool,
  buildReadDrawingsTool,
  textResult,
} from './dataTools.js';
import { buildReassessPack as defaultBuildReassessPack, type ReassessPack } from './datapack.js';
import { MessagesEngine } from './messages/messageEngine.js';
import { SkillCatalogProvider, toSkillContexts } from './messages/sharedProviders.js';
import type { AiModel } from './models.js';
import {
  CHAT_DIALOG_RULES,
  CHAT_GATED_RETRY_INSTRUCTION,
  CHAT_GATED_TURN_INSTRUCTION,
  CHAT_TOOLING_SCOPE_NOTE,
  RESEARCH_TOOLING_RULES,
} from './prompts.js';
import {
  composeWithDiscipline,
  DisciplineMissingError,
  loadSharedDiscipline,
} from './promptPolicy.js';
import { isUsage } from './usage.js';
import {
  type DirectionalVerification,
  isDirectionalClaim,
  rejectAnswer,
  verifyDirectionalRead,
} from './verifyRead.js';
import { prepareProAiTurn } from '../pro/aiExtension.js';

const COMMENT_CAP = 20;
const RELEVANT_COMMENT_SOURCES = new Set(['analyst', 'system']);

export type ChatEvent = ConversationEvent;

export interface ChatDisplayMessage {
  id: string;
  ts: string;
  kind: 'user' | 'assistant' | 'tool';
  text?: string;
  label?: string;
  input?: string;
  output?: string;
  meta?: {
    provider: string;
    model: string;
    totalTokens: number;
    costTotal: number;
  };
}

export interface ChatDeps {
  model: AiModel | null;
  loadChart?: (chartId: string) => Promise<ChartDoc | null>;
  listComments?: (symbol: string, date: string) => Promise<CockpitComment[]>;
  buildPack?: (symbol: string) => Promise<ReassessPack>;
  fetchKline?: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  fetchNews?: (symbol: string) => Promise<NewsItem[]>;
  readAnnotations?: (symbol: string) => Promise<Annotation[]>;
  writeAnnotations?: (symbol: string, annotations: Annotation[]) => Promise<void>;
  genId?: () => string;
  agentFactory?: AiAgentFactory;
  timeoutMs?: number;
  now?: () => number;
  repoRoot?: string;
  disciplineText?: string;
  exec?: ExecFn;
}

export type ChatStartResult =
  | { started: false; reason: 'busy' | 'chart_not_found' | 'not_intraday' | 'no_model' }
  | { started: true; done: Promise<void> };

function toolResultText(message: Extract<AgentMessage, { role: 'toolResult' }>): string {
  return message.content.map(textOf).join('');
}

export function toDisplayMessages(rows: ChatMessageRow[]): ChatDisplayMessage[] {
  const outputs = new Map<string, string>();
  for (const row of rows) {
    const message = row.payload;
    if (message.role === 'toolResult') outputs.set(message.toolCallId, toolResultText(message));
  }

  const out: ChatDisplayMessage[] = [];
  for (const row of rows) {
    const message = row.payload;
    if (message.role === 'user') {
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content.map(textOf).join('');
      out.push({ id: row.id, ts: row.ts, kind: 'user', text });
      continue;
    }
    if (message.role === 'assistant') {
      let lastTextIndex = -1;
      for (let idx = message.content.length - 1; idx >= 0; idx -= 1) {
        if (message.content[idx]?.type === 'text') {
          lastTextIndex = idx;
          break;
        }
      }
      const usage = isUsage(message.usage) ? message.usage : null;
      const meta =
        usage && (usage.totalTokens > 0 || usage.cost.total > 0)
          ? {
              provider: message.provider,
              model: message.model,
              totalTokens: usage.totalTokens,
              costTotal: usage.cost.total,
            }
          : undefined;
      message.content.forEach((block, idx) => {
        const id = idx === 0 ? row.id : `${row.id}:${idx}`;
        if (block.type === 'text') {
          out.push({
            id,
            ts: row.ts,
            kind: 'assistant',
            text: block.text,
            ...(idx === lastTextIndex && meta ? { meta } : {}),
          });
        } else if (block.type === 'toolCall') {
          out.push({
            id,
            ts: row.ts,
            kind: 'tool',
            label: block.name,
            input: stringifyPayload(block.arguments),
            output: stringifyPayload(outputs.get(block.id)),
          });
        }
      });
    }
  }
  return out;
}

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
});

function etClock(ts: string): string {
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? clockFormatter.format(new Date(ms)) : ts;
}

export function buildChatSystemPrompt(
  doc: ChartDoc,
  analysisDayComments: CockpitComment[],
  disciplineText = '',
): string {
  const prediction = (doc.input.prediction as IntradayPrediction | undefined) ?? null;
  const predictionText = prediction ? JSON.stringify(prediction) : 'No prediction is attached to this analysis.';

  const commentLines = analysisDayComments
    .filter((c) => RELEVANT_COMMENT_SOURCES.has(c.source) && c.level !== 'error')
    .slice(-COMMENT_CAP)
    .map((c) => `${etClock(c.ts)} ${c.text}`);

  const own = [
    'You are Kansoku\'s short-term technical-analysis chat mode. The user is asking follow-up questions about an archived intraday analysis in Kansoku.',
    '',
    `Symbol: ${doc.symbol}`,
    `Analysis created at: ${doc.created_at}`,
    `Archived prediction: ${predictionText}`,
    commentLines.length ? `Analyst comments for this day:\n${commentLines.join('\n')}` : 'There are no analyst comments for this day.',
    '',
    CHAT_DIALOG_RULES,
    '',
    RESEARCH_TOOLING_RULES,
    CHAT_TOOLING_SCOPE_NOTE,
  ].join('\n');

  // Chat is where the user pushes back on a call, so it is a judgment agent: the caller loads the
  // shared discipline and fails closed without it. Injected rather than read here so this stays a
  // pure function.
  return composeWithDiscipline(disciplineText, own);
}

const claimStatusSchema = Type.Union([
  Type.Literal('supported'),
  Type.Literal('partial'),
  Type.Literal('contradicted'),
  Type.Literal('insufficient'),
]);

const submitChatAnswerSchema = Type.Object({
  claim_status: claimStatusSchema,
  verification_id: Type.Optional(Type.String()),
  answer: Type.String(),
});

const noArgsSchema = Type.Object({});

// Per-turn verification ledger. A submitted answer may only cite an id minted in this turn.
interface VerifyCtx {
  minted: Map<string, DirectionalVerification>;
  answer: string | null;
  seq: number;
}

function buildVerifyTools(
  symbol: string,
  ctx: VerifyCtx,
  deps: { buildPack: (symbol: string) => Promise<ReassessPack>; now: () => number },
): AgentTool[] {
  const verifyTool: AgentTool<typeof noArgsSchema> = {
    name: 'verify_directional_read',
    label: 'Verify Directional Read',
    description:
      'Verify the user\'s directional claim. Fetch fresh live data and calculate current price, regular-session high/low, premarket high, and prior-day high/close on the server, then return a mechanical result for whether price truly exceeded the premarket high. Call this first when the user claims a breakout, bottom, or dumping.',
    parameters: noArgsSchema,
    execute: async () => {
      const pack = await deps.buildPack(symbol);
      ctx.seq += 1;
      const id = `v${ctx.seq}`;
      const verification = verifyDirectionalRead(pack, id, new Date(deps.now()));
      ctx.minted.set(id, verification);
      return textResult(JSON.stringify(verification));
    },
  };

  const submitTool: AgentTool<typeof submitChatAnswerSchema> = {
    name: 'submit_chat_answer',
    label: 'Submit Answer',
    description:
      'Submit the answer for this turn. When the user made a directional claim, this tool is required and must include the verification_id returned by this turn\'s verify_directional_read. claim_status must be one of supported, partial, contradicted, or insufficient; use insufficient rather than taking a side when evidence is inadequate.',
    parameters: submitChatAnswerSchema,
    execute: async (_id, params) => {
      const rejection = rejectAnswer(params, ctx.minted);
      if (rejection) return textResult(rejection);
      if (!params.answer.trim()) return textResult('rejected: answer must not be empty.');
      ctx.answer = params.answer;
      return textResult('accepted');
    },
  };

  return [verifyTool, submitTool];
}

function buildTools(
  symbol: string,
  deps: {
    buildPack: (symbol: string) => Promise<ReassessPack>;
    fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
    fetchNews: (symbol: string) => Promise<NewsItem[]>;
    readAnnotations: (symbol: string) => Promise<Annotation[]>;
    writeAnnotations: (symbol: string, annotations: Annotation[]) => Promise<void>;
    now: () => number;
    genId: () => string;
  },
  verifyCtx: VerifyCtx | null,
): AgentTool[] {
  const base = [
    buildDataPackTool(symbol, { buildPack: deps.buildPack }),
    buildKlineTool(symbol, deps.fetchKline),
    buildNewsTool(symbol, deps.fetchNews),
    buildReadDrawingsTool(symbol, deps.readAnnotations),
    buildDrawAnnotationsTool(symbol, {
      readAnnotations: deps.readAnnotations,
      writeAnnotations: deps.writeAnnotations,
      now: deps.now,
      genId: deps.genId,
    }),
  ];
  // The verification pair only exists on turns where the user actually made a directional claim.
  // Handing it to every turn would train the model to route ordinary questions through a gate
  // that has nothing to check.
  return verifyCtx ? [...base, ...buildVerifyTools(symbol, verifyCtx, deps)] : base;
}

function prepareTurn(
  chartId: string,
  text: string,
  doc: ChartDoc,
  symbol: string,
  model: AiModel,
  deps: ChatDeps,
): ConversationPreparedTurn {
  const nowFn = () => (deps.now ? deps.now() : Date.now());
  return {
    model,
    agentFactory: deps.agentFactory,
    timeoutMs: deps.timeoutMs,
    now: deps.now,
    store: {
      getSession: () => getSessionByChartId(chartId),
      createSession: (title) => createSession({ chartId, symbol, title }),
      listMessages: (sessionId) => listMessages(sessionId),
      appendMessages: (sessionId, messages) => appendMessages(sessionId, messages),
    },
    buildTurn: async (activeSessionId) => {
      const listCommentsFn = deps.listComments ?? defaultListComments;
      const buildPackFn = deps.buildPack ?? defaultBuildReassessPack;
      const fetchKlineFn =
        deps.fetchKline ??
        ((sym, period, count) => getProvider(marketOf(sym)).getKline(sym, period, count));
      const fetchNewsFn = deps.fetchNews ?? ((sym) => getProvider(marketOf(sym)).getNews(sym));
      const readAnnotationsFn =
        deps.readAnnotations ?? ((sym) => annotationsService.list({ symbol: sym }));
      const writeAnnotationsFn =
        deps.writeAnnotations ??
        (async (sym: string, annotations: Annotation[]) => {
          await annotationsService.replace({ symbol: sym, annotations });
        });
      const genIdFn = deps.genId ?? randomUUID;

      const analysisDayComments = await listCommentsFn(
        symbol,
        easternDate(new Date(doc.created_at)),
      );
      const disciplineText =
        deps.disciplineText ?? loadSharedDiscipline(deps.repoRoot ?? PROJECT_ROOT);
      if (!disciplineText) throw new DisciplineMissingError();
      const systemPrompt = buildChatSystemPrompt(doc, analysisDayComments, disciplineText);

      const gated = isDirectionalClaim(text);
      const verifyCtx: VerifyCtx | null = gated
        ? { minted: new Map(), answer: null, seq: 0 }
        : null;

      const tools = buildTools(
        symbol,
        {
          buildPack: buildPackFn,
          fetchKline: fetchKlineFn,
          fetchNews: fetchNewsFn,
          readAnnotations: readAnnotationsFn,
          writeAnnotations: writeAnnotationsFn,
          now: nowFn,
          genId: genIdFn,
        },
        verifyCtx,
      );

      const repoRoot = deps.repoRoot ?? PROJECT_ROOT;
      const proTurn = await prepareProAiTurn({
        surface: 'chart-chat',
        sessionId: activeSessionId,
        symbol,
        market: marketOf(symbol),
      });
      const { tools: researchTools, skillIndex } = buildResearchTools({
        repoRoot,
        exec: deps.exec,
        readMounts: proTurn.readMounts,
      });
      const messageEngine = new MessagesEngine([
        ...proTurn.processors,
        new SkillCatalogProvider(toSkillContexts(skillIndex)),
      ]);

      return {
        symbol,
        systemPrompt,
        tools: [...tools, ...researchTools],
        transformContext: async (messages) => (await messageEngine.process(messages)).messages,
        onTurnComplete: proTurn.onTurnComplete,
        gate: verifyCtx
          ? {
              instruction: CHAT_GATED_TURN_INSTRUCTION,
              retryInstruction: CHAT_GATED_RETRY_INSTRUCTION,
              failClosedMessage: 'The answer did not pass directional verification and was blocked. Retry or use Reassess.',
              answer: () => verifyCtx.answer,
            }
          : undefined,
      };
    },
  };
}

const engine = createConversationEngine<ChatDeps, 'chart_not_found' | 'not_intraday' | 'no_model'>({
  layer: 'chat',
  logLabels: {
    persistFailure: 'chat: failed to persist failure-path increment',
    preTurnFailure: 'chat: executeChatTurn failed before the agent turn started',
  },
  prepare: async (chartId, text, deps) => {
    const loadChartFn = deps.loadChart ?? defaultLoadChart;
    const doc = await loadChartFn(chartId);
    if (!doc) return { ok: false, reason: 'chart_not_found' };
    if (doc.built.kind !== 'intraday' || !doc.symbol) return { ok: false, reason: 'not_intraday' };
    if (!deps.model) return { ok: false, reason: 'no_model' };
    return { ok: true, turn: prepareTurn(chartId, text, doc, doc.symbol, deps.model, deps) };
  },
});

export function onChatEvent(chartId: string, listener: (event: ChatEvent) => void): () => void {
  return engine.onEvent(chartId, listener);
}

export function chatTurnState(chartId: string): { busy: boolean; partial: string } {
  return engine.turnState(chartId);
}

export function abortChatTurn(chartId: string): boolean {
  return engine.abort(chartId);
}

export function runChatTurn(
  chartId: string,
  text: string,
  deps: ChatDeps,
): Promise<ChatStartResult> {
  return engine.run(chartId, text, deps);
}
