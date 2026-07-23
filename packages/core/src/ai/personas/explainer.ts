import type { AgentTool } from '@earendil-works/pi-agent-core';
import { type Static, Type } from 'typebox';
import type { CockpitComment, ExplainResult } from '@kansoku/shared/types';
import { AgentTimeoutError, type AiAgentFactory, createAgentSession } from '../agents/agentSession.js';
import { appendComment as defaultAppendComment } from './comments.js';
import { buildCommentPack, type CommentPack } from '../agents/datapack.js';
import type { AiModel } from '../runtime/models.js';
import { aiConfig } from '../runtime/models.js';
import { EXPLAINER_PROMPT, EXPLAINER_RETRY_PROMPT } from '../runtime/prompts.js';
import { MessagesEngine } from '../conversation/messages/messageEngine.js';
import { composeWithDiscipline, OBSERVER_CONTRACT } from '../runtime/promptPolicy.js';
import { createRunLock } from '../agents/runLock.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_PROMPT_CHARS = 24_000;
const MANUAL_TRIGGER = 'manual: 解读请求';

const SYSTEM_PROMPT = composeWithDiscipline(OBSERVER_CONTRACT, EXPLAINER_PROMPT);

export interface ExplainerDeps {
  resolveModel?: () => AiModel | null;
  buildPack?: (symbol: string) => Promise<CommentPack>;
  agentFactory?: AiAgentFactory;
  appendComment?: (comment: CockpitComment) => Promise<void>;
  timeoutMs?: number;
  now?: () => Date;
}

const explainerRunLock = createRunLock();

const submitSchema = Type.Object({
  text: Type.String({ description: 'The full four-section explanation in 中文白话.' }),
  stance: Type.Union([
    Type.Literal('act_per_plan'),
    Type.Literal('wait_confirm'),
    Type.Literal('no_action'),
  ]),
});

type SubmitParams = Static<typeof submitSchema>;

function buildSubmitTool(
  symbol: string,
  append: (comment: CockpitComment) => Promise<void>,
  onSubmit: (comment: CockpitComment) => void,
  isTerminated: () => boolean,
): AgentTool<typeof submitSchema> {
  return {
    name: 'submit_explanation',
    label: 'Submit Explanation',
    description: 'Record the plain-language chart explanation. Call exactly once.',
    parameters: submitSchema,
    execute: async (_id, params: SubmitParams) => {
      if (isTerminated()) {
        return { content: [{ type: 'text', text: 'skipped' }], details: {}, terminate: true };
      }
      const comment: CockpitComment = {
        ts: new Date().toISOString(),
        symbol,
        level: 'info',
        text: params.text,
        stance: params.stance,
        trigger: MANUAL_TRIGGER,
        source: 'explainer',
      };
      await append(comment);
      onSubmit(comment);
      return { content: [{ type: 'text', text: 'recorded' }], details: {}, terminate: true };
    },
  };
}

export async function explainSymbol(symbol: string, deps: ExplainerDeps = {}): Promise<ExplainResult> {
  const model = (deps.resolveModel ?? (() => aiConfig().commentModel))();
  if (!model) return { ok: false, reason: 'disabled' };

  if (!explainerRunLock.tryAcquire(symbol)) return { ok: false, reason: 'busy' };

  const append = deps.appendComment ?? defaultAppendComment;
  const buildPack = deps.buildPack ?? buildCommentPack;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const writeError = (text: string) =>
    append({
      ts: new Date().toISOString(),
      symbol,
      level: 'error',
      text,
      trigger: MANUAL_TRIGGER,
      source: 'system',
    });

  let session: ReturnType<typeof createAgentSession> | undefined;

  try {
    let submitted: CockpitComment | null = null;
    const tool = buildSubmitTool(
      symbol,
      append,
      (comment) => {
        submitted = comment;
      },
      () => session?.isDone() ?? false,
    );

    const pack = await buildPack(symbol);
    const messageEngine = new MessagesEngine([]);
    session = createAgentSession({
      layer: 'explainer',
      symbol,
      model,
      systemPrompt: SYSTEM_PROMPT,
      tools: [tool],
      transformContext: async (messages) => (await messageEngine.process(messages)).messages,
      agentFactory: deps.agentFactory,
    });

    const promptText = JSON.stringify({ pack }).slice(0, MAX_PROMPT_CHARS);
    await session.runTurn(promptText, timeoutMs);
    if (submitted === null) {
      await session.runTurn(EXPLAINER_RETRY_PROMPT, timeoutMs);
    }

    if (submitted === null) {
      await writeError('解读盘面重试一次后仍未调用 submit_explanation，本次无结论。');
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, comment: submitted };
  } catch (err) {
    const text =
      err instanceof AgentTimeoutError
        ? `解读盘面超时未产出结论（${timeoutMs}ms）。`
        : `解读盘面运行失败：${err instanceof Error ? err.message : String(err)}`;
    await writeError(text);
    return { ok: false, reason: 'failed' };
  } finally {
    explainerRunLock.release(symbol);
  }
}
