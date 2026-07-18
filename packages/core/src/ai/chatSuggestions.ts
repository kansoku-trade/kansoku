import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ChartDoc, CockpitComment, IntradayPrediction } from "@kansoku/shared/types";
import { easternDate } from "../services/session.js";
import { loadChart as defaultLoadChart } from "../services/store.js";
import { type AiAgentFactory, createAgentSession } from "./agentSession.js";
import { listComments as defaultListComments } from "./comments.js";
import type { AiModel } from "./models.js";
import { aiConfig } from "./models.js";
import { CHAT_SUGGESTIONS_PROMPT } from "./prompts.js";

const TIMEOUT_MS = 30_000;
const MAX_SUGGESTIONS = 3;
const MAX_LENGTH = 40;

const submitSchema = Type.Object({
  questions: Type.Array(Type.String(), { description: "3 条追问问题，每条不超过 20 字" }),
});

type SubmitParams = Static<typeof submitSchema>;

export interface ChatSuggestionDeps {
  model?: AiModel | null;
  loadChart?: (chartId: string) => Promise<ChartDoc | null>;
  listComments?: (symbol: string, date: string) => Promise<CockpitComment[]>;
  agentFactory?: AiAgentFactory;
  timeoutMs?: number;
}

const cache = new Map<string, string[]>();
const inFlight = new Map<string, Promise<string[]>>();

export function clearChatSuggestionCache(): void {
  cache.clear();
  inFlight.clear();
}

function normalize(questions: unknown): string[] {
  if (!Array.isArray(questions)) return [];
  const out: string[] = [];
  for (const raw of questions) {
    if (typeof raw !== "string") continue;
    const text = raw.trim().slice(0, MAX_LENGTH);
    if (text && !out.includes(text)) out.push(text);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

async function generate(chartId: string, deps: ChatSuggestionDeps): Promise<string[]> {
  const loadChartFn = deps.loadChart ?? defaultLoadChart;
  const doc = await loadChartFn(chartId);
  if (!doc || doc.built.kind !== "intraday" || !doc.symbol) return [];

  const model = deps.model !== undefined ? deps.model : aiConfig().commentModel;
  if (!model) return [];

  const symbol = doc.symbol;
  const listCommentsFn = deps.listComments ?? defaultListComments;
  const comments = await listCommentsFn(symbol, easternDate(new Date(doc.created_at)));
  const prediction = (doc.input.prediction as IntradayPrediction | undefined) ?? null;

  let questions: string[] | null = null;
  const tool: AgentTool<typeof submitSchema> = {
    name: "submit_questions",
    label: "Submit Questions",
    description: "提交 3 条追问问题。必须调用恰好一次。",
    parameters: submitSchema,
    execute: async (_id, params: SubmitParams) => {
      questions = params.questions;
      return { content: [{ type: "text", text: "ok" }], details: {}, terminate: true };
    },
  };

  const session = createAgentSession({
    layer: "chat-suggest",
    symbol,
    model,
    systemPrompt: CHAT_SUGGESTIONS_PROMPT,
    tools: [tool],
    agentFactory: deps.agentFactory,
  });

  await session.runTurn(
    JSON.stringify({
      symbol,
      prediction,
      comments: comments.filter((c) => c.level !== "error").map((c) => c.text),
    }),
    deps.timeoutMs ?? TIMEOUT_MS,
  );

  const errorMessage = session.agent.state?.errorMessage;
  if (errorMessage) console.error(`chat: suggestion model failed for ${symbol}: ${errorMessage}`);

  return normalize(questions);
}

export async function buildChatSuggestions(chartId: string, deps: ChatSuggestionDeps = {}): Promise<string[]> {
  const cached = cache.get(chartId);
  if (cached) return cached;
  const running = inFlight.get(chartId);
  if (running) return running;

  const task = generate(chartId, deps)
    .then((questions) => {
      if (questions.length) cache.set(chartId, questions);
      return questions;
    })
    .catch((err) => {
      console.error("chat: failed to build suggestions", err);
      return [] as string[];
    })
    .finally(() => {
      inFlight.delete(chartId);
    });

  inFlight.set(chartId, task);
  return task;
}
