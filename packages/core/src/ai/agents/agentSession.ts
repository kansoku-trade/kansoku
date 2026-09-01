import { randomUUID } from 'node:crypto';
import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from '@earendil-works/pi-agent-core';
import { getModelsRuntime } from '../runtime/modelsRuntime.js';
import type { AiModel } from '../runtime/models.js';
import { attachAiUsageLogger, type AiUsageLogContext } from '../runtime/usage.js';

function isOpenRouterUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === 'openrouter.ai';
  } catch {
    return false;
  }
}

function withOpenRouterSessionAffinity<Model extends { baseUrl: string; compat?: object }>(
  model: Model,
): Model {
  return {
    ...model,
    compat: {
      ...model.compat,
      sendSessionAffinityHeaders: true,
      sessionAffinityFormat: 'openrouter',
    },
  } as Model;
}

export const runtimeStreamFn: StreamFn = (model, context, options) => {
  const requestModel =
    options?.sessionId && isOpenRouterUrl(model.baseUrl)
      ? withOpenRouterSessionAffinity(model)
      : model;
  return getModelsRuntime().streamSimple(requestModel, context, options);
};

export interface AiAgentHandle {
  prompt(text: string): Promise<unknown>;
  continue?(): Promise<unknown>;
  abort(): void;
  setTools?(tools: AgentTool[]): void;
  subscribe?(listener: (event: AgentEvent) => void): () => void;
  state?: { messages: AgentMessage[]; errorMessage?: string };
}

export type AiAgentFactory = (config: {
  systemPrompt: string;
  model: AiModel;
  tools: AgentTool[];
  messages?: AgentMessage[];
  sessionId: string;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
}) => AiAgentHandle;

export class AgentTimeoutError extends Error {}

const NETWORK_RETRIES = 5;
const NETWORK_BACKOFF_MS = 1000;
const NETWORK_ERROR =
  /network|econnreset|etimedout|enotfound|econnrefused|eai_again|socket|fetch failed|undici|429|502|503|504|rate.?limit|too many requests|cloud_unavailable|流式响应中断|上游断|暂时不可用|过于频繁/i;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAbortError(err: unknown): boolean {
  return /abort/i.test(errorText(err));
}

function isRetryableNetworkError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (code === 'network_error' || code === 'rate_limited' || code === 'cloud_unavailable') {
      return true;
    }
    if (typeof code === 'string' && /^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR)/i.test(code)) {
      return true;
    }
  }
  return NETWORK_ERROR.test(errorText(err));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryNetwork(agent: AiAgentHandle, first: unknown): Promise<void> {
  let last = first;
  for (let attempt = 0; attempt < NETWORK_RETRIES; attempt++) {
    await sleep(NETWORK_BACKOFF_MS * 2 ** attempt);
    try {
      await agent.continue!();
      if (!agent.state?.errorMessage) return;
      last = new Error(agent.state.errorMessage);
      if (!isRetryableNetworkError(last)) throw last;
    } catch (err) {
      if (isAbortError(err) || !isRetryableNetworkError(err)) throw err;
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function runUntilSettled(agent: AiAgentHandle, prompt: string): Promise<void> {
  try {
    await agent.prompt(prompt);
  } catch (err) {
    if (!agent.continue || !isRetryableNetworkError(err)) throw err;
    await retryNetwork(agent, err);
    return;
  }
  if (
    agent.continue &&
    agent.state?.errorMessage &&
    isRetryableNetworkError(new Error(agent.state.errorMessage))
  ) {
    await retryNetwork(agent, new Error(agent.state.errorMessage));
  }
}

const defaultAgentFactory: AiAgentFactory = (config) => {
  const agent = new Agent({
    streamFn: runtimeStreamFn,
    initialState: {
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
      ...(config.model.thinkingLevel ? { thinkingLevel: config.model.thinkingLevel } : {}),
      ...(config.messages ? { messages: config.messages } : {}),
    },
    sessionId: config.sessionId,
    transformContext: config.transformContext,
  });
  return {
    prompt: (text: string) => agent.prompt(text),
    continue: () => agent.continue(),
    abort: () => agent.abort(),
    setTools: (tools) => {
      agent.state.tools = tools;
    },
    subscribe: (listener: Parameters<Agent['subscribe']>[0]) => agent.subscribe(listener),
    state: agent.state,
  };
};

export function createAgentSession(config: {
  layer: AiUsageLogContext['layer'];
  symbol: string;
  origin?: string;
  model: AiModel;
  systemPrompt: string;
  tools: AgentTool[];
  messages?: AgentMessage[];
  sessionId?: string;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  agentFactory?: AiAgentFactory;
  onEvent?: (event: AgentEvent) => void;
  persistUsage?: boolean;
}): {
  agent: AiAgentHandle;
  runTurn(prompt: string, timeoutMs?: number): Promise<void>;
  isDone(): boolean;
} {
  const factory = config.agentFactory ?? defaultAgentFactory;
  const sessionId = config.sessionId ?? `${config.layer}:${randomUUID()}`;
  const agent = factory({
    systemPrompt: config.systemPrompt,
    model: config.model,
    tools: config.tools,
    messages: config.messages,
    sessionId,
    transformContext: config.transformContext,
  });

  attachAiUsageLogger(agent, {
    layer: config.layer,
    symbol: config.symbol,
    model: config.model,
    ...(config.origin ? { origin: config.origin } : {}),
    persistUsage: config.persistUsage,
  });

  if (config.onEvent) agent.subscribe?.(config.onEvent);

  let done = false;
  let inFlight = false;

  async function runTurn(prompt: string, timeoutMs?: number): Promise<void> {
    if (inFlight) {
      throw new Error('agent session turn already in flight');
    }
    inFlight = true;
    done = false;
    try {
      if (timeoutMs == null || timeoutMs <= 0) {
        await runUntilSettled(agent, prompt);
        done = true;
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          agent.abort();
          reject(new AgentTimeoutError(`timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        agent.prompt(prompt).then(
          () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve();
          },
          (err) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(err instanceof Error ? err : new Error(String(err)));
          },
        );
      });
    } finally {
      inFlight = false;
    }
  }

  return {
    agent,
    runTurn,
    isDone: () => done,
  };
}
