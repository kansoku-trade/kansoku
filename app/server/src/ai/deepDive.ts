import { exec as nodeExec } from "node:child_process";
import { promisify } from "node:util";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { PROJECT_ROOT } from "../env.js";
import { buildSystemPrompt, buildTools, type ExecFn, type ExecResult } from "./deepDiveTools.js";
import { resolveModel, type AiModel } from "./models.js";
import { notifyUser } from "./notify.js";
import { attachAiUsageLogger } from "./usage.js";

const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const BASH_TIMEOUT_MS = 120_000;
const BASH_MAX_BUFFER = 10 * 1024 * 1024;

const nodeExecAsync = promisify(nodeExec);

export type DeepDiveState = {
  running: boolean;
  symbol?: string;
  startedAt?: string;
  lastResult?: { symbol: string; ok: boolean; finishedAt: string; error?: string; dirtyWarning?: boolean };
};

export interface DeepDiveAgent {
  prompt(text: string): Promise<unknown>;
  abort(): void;
}

export type DeepDiveAgentFactory = (config: {
  systemPrompt: string;
  model: AiModel;
  tools: AgentTool[];
}) => DeepDiveAgent;

export type { ExecFn, ExecResult };

export interface DeepDiveDeps {
  model: AiModel | null;
  agentFactory?: DeepDiveAgentFactory;
  notify?: (title: string, message: string) => void;
  repoRoot?: string;
  stocksDir?: string;
  exec?: ExecFn;
  timeoutMs?: number;
  now?: () => number;
}

let state: DeepDiveState = { running: false };

export function deepDiveState(): DeepDiveState {
  return state;
}

export function resetDeepDiveStateForTests(): void {
  state = { running: false };
}

class DeepDiveTimeoutError extends Error {}

function defaultExec(repoRoot: string): ExecFn {
  return async (command: string) => {
    const { stdout, stderr } = await nodeExecAsync(command, {
      cwd: repoRoot,
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: BASH_MAX_BUFFER,
    });
    return { stdout, stderr };
  };
}

async function captureGitStatus(exec: ExecFn): Promise<string> {
  try {
    const { stdout } = await exec("git status --porcelain -- stocks/");
    return stdout;
  } catch {
    return "";
  }
}

function unexpectedDirty(before: string, after: string, symbol: string): boolean {
  const noteLine = `stocks/${symbol}.md`;
  const beforeLines = new Set(before.split("\n").filter(Boolean));
  const afterLines = after.split("\n").filter(Boolean);
  return afterLines.some((line) => !beforeLines.has(line) && !line.includes(noteLine));
}

export const defaultAgentFactory: DeepDiveAgentFactory = (config) =>
  new Agent({
    initialState: {
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
    },
  });

async function runWithTimeout(agent: DeepDiveAgent, prompt: string, timeoutMs: number): Promise<void> {
  let done = false;
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      agent.abort();
      reject(new DeepDiveTimeoutError(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    agent.prompt(prompt).then(
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolvePromise();
      },
      (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function executeDeepDiveRun(symbol: string, deps: DeepDiveDeps): Promise<void> {
  const repoRoot = deps.repoRoot ?? PROJECT_ROOT;
  const notify = deps.notify ?? notifyUser;
  const factory = deps.agentFactory ?? defaultAgentFactory;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const exec = deps.exec ?? defaultExec(repoRoot);
  const now = deps.now ?? (() => Date.now());

  const before = await captureGitStatus(exec);

  try {
    if (!deps.model) throw new Error("model not resolved");
    const tools = buildTools(repoRoot, symbol, exec, deps.stocksDir);
    const systemPrompt = buildSystemPrompt(repoRoot);
    const agent = factory({ systemPrompt, model: deps.model, tools });
    attachAiUsageLogger(agent, { layer: "analyst", symbol, model: deps.model, origin: "deep-dive" });

    await runWithTimeout(
      agent,
      `Run the stock-deep-dive skill flow for ${symbol}, then write the updated note.`,
      timeoutMs,
    );

    const after = await captureGitStatus(exec);
    const dirtyWarning = unexpectedDirty(before, after, symbol);

    state = {
      running: false,
      lastResult: {
        symbol,
        ok: true,
        finishedAt: new Date(now()).toISOString(),
        ...(dirtyWarning ? { dirtyWarning: true } : {}),
      },
    };
    notify(
      `${symbol} deep dive complete`,
      dirtyWarning
        ? "⚠️ note updated, but unexpected changes outside the target note were detected."
        : "note updated.",
    );
  } catch (err) {
    const message = err instanceof DeepDiveTimeoutError ? err.message : err instanceof Error ? err.message : String(err);
    console.error(`[deep-dive] ${symbol} failed: ${message}`);
    state = {
      running: false,
      lastResult: { symbol, ok: false, finishedAt: new Date(now()).toISOString(), error: message },
    };
    notify(`${symbol} deep dive failed`, message);
  }
}

export function startDeepDive(
  symbol: string,
  deps?: Partial<DeepDiveDeps>,
): { started: true } | { started: false; reason: "busy" | "disabled" } {
  if (state.running) return { started: false, reason: "busy" };

  const model = deps && "model" in deps ? deps.model ?? null : resolveModel(process.env.AI_DEEPDIVE_MODEL);
  if (!model) return { started: false, reason: "disabled" };

  const now = deps?.now ?? (() => Date.now());
  state = { running: true, symbol, startedAt: new Date(now()).toISOString() };

  void executeDeepDiveRun(symbol, { ...deps, model });
  return { started: true };
}
