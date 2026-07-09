import { Agent, type AgentEvent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { getCodexApiKey } from "./codexAuth.js";
import type { AiModel } from "./models.js";
import { attachAiUsageLogger, type AiUsageLogContext } from "./usage.js";

export interface AiAgentHandle {
  prompt(text: string): Promise<unknown>;
  abort(): void;
  setTools?(tools: AgentTool[]): void;
  subscribe?(listener: (event: AgentEvent) => void): () => void;
  state?: { messages: AgentMessage[] };
}

export type AiAgentFactory = (config: {
  systemPrompt: string;
  model: AiModel;
  tools: AgentTool[];
  messages?: AgentMessage[];
}) => AiAgentHandle;

export class AgentTimeoutError extends Error {}

const defaultAgentFactory: AiAgentFactory = (config) => {
  const agent = new Agent({
    getApiKey: getCodexApiKey,
    initialState: {
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
      ...(config.model.thinkingLevel ? { thinkingLevel: config.model.thinkingLevel } : {}),
      ...(config.messages ? { messages: config.messages } : {}),
    },
  });
  return {
    prompt: (text: string) => agent.prompt(text),
    abort: () => agent.abort(),
    setTools: (tools) => {
      agent.state.tools = tools;
    },
    subscribe: (listener: Parameters<Agent["subscribe"]>[0]) => agent.subscribe(listener),
    state: agent.state,
  };
};

export function createAgentSession(config: {
  layer: AiUsageLogContext["layer"];
  symbol: string;
  origin?: string;
  model: AiModel;
  systemPrompt: string;
  tools: AgentTool[];
  messages?: AgentMessage[];
  agentFactory?: AiAgentFactory;
  onEvent?: (event: AgentEvent) => void;
}): {
  agent: AiAgentHandle;
  runTurn(prompt: string, timeoutMs: number): Promise<void>;
  isDone(): boolean;
} {
  const factory = config.agentFactory ?? defaultAgentFactory;
  const agent = factory({
    systemPrompt: config.systemPrompt,
    model: config.model,
    tools: config.tools,
    messages: config.messages,
  });

  attachAiUsageLogger(agent, {
    layer: config.layer,
    symbol: config.symbol,
    model: config.model,
    ...(config.origin ? { origin: config.origin } : {}),
  });

  if (config.onEvent) agent.subscribe?.(config.onEvent);

  let done = false;
  let inFlight = false;

  async function runTurn(prompt: string, timeoutMs: number): Promise<void> {
    if (inFlight) {
      throw new Error("agent session turn already in flight");
    }
    inFlight = true;
    done = false;
    try {
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
