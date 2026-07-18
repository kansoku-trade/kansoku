import { PROJECT_ROOT } from "../env.js";
import type { Db } from "../db/index.js";
import { buildResearchTools, type ExecFn } from "./agentTools.js";
import type { AiAgentFactory } from "./agentSession.js";
import {
  appendAssistantMessages,
  type AssistantSession,
  getAssistantSession,
  listAssistantMessages,
} from "./assistantChatStore.js";
import type { ChatEvent } from "./chat.js";
import {
  type ConversationPreparedTurn,
  createConversationEngine,
} from "./conversationEngine.js";
import { MessagesEngine } from "./messages/messageEngine.js";
import { SkillCatalogProvider, toSkillContexts } from "./messages/sharedProviders.js";
import { composeWithDiscipline, DisciplineMissingError, loadSharedDiscipline } from "./promptPolicy.js";
import { buildResearchLibraryTools } from "./researchLibraryTools.js";
import type { AiModel } from "./models.js";

export interface AssistantChatDeps {
  model: AiModel | null;
  rootDir?: string;
  db?: Db;
  agentFactory?: AiAgentFactory;
  timeoutMs?: number;
  disciplineText?: string;
  exec?: ExecFn;
}

export type AssistantChatStartResult =
  | { started: false; reason: "busy" | "no_model" | "not_found" }
  | { started: true; done: Promise<void> };

function buildSystemPrompt(disciplineText: string): string {
  const own = [
    "你是 Kansoku 仓库级通用研究助手，不挂任何图表或研究文档。",
    "只有只读 bash 工具，可跑 longbridge CLI 与 .claude/skills/**/scripts/*.py 脚本查行情、宏观数据、文件；可读取仓库文件、读取 skill 全文、搜索并读取研究库文档。",
    "用户消息里出现 @路径（如 @stocks/MU.md）时，先用读文件工具读取该文件再回答。",
    "引用结论要写明文件路径；引用实时数据要标明拉取时间属性。",
  ].join("\n");
  return composeWithDiscipline(disciplineText, own);
}

function prepareTurn(
  sessionId: string,
  session: AssistantSession,
  model: AiModel,
  deps: AssistantChatDeps,
): ConversationPreparedTurn {
  const rootDir = deps.rootDir ?? PROJECT_ROOT;
  return {
    model,
    agentFactory: deps.agentFactory,
    timeoutMs: deps.timeoutMs,
    store: {
      getSession: () => getAssistantSession(sessionId, deps.db),
      createSession: () => Promise.resolve(session),
      listMessages: (id) => listAssistantMessages(id, deps.db),
      appendMessages: (id, messages) => appendAssistantMessages(id, messages, deps.db),
    },
    buildTurn: async () => {
      const disciplineText = deps.disciplineText ?? loadSharedDiscipline(rootDir);
      if (!disciplineText) throw new DisciplineMissingError();
      const { tools: researchTools, skillIndex } = buildResearchTools({ repoRoot: rootDir, exec: deps.exec });
      const messageEngine = new MessagesEngine([new SkillCatalogProvider(toSkillContexts(skillIndex))]);
      return {
        symbol: "ASSISTANT",
        origin: "assistant",
        systemPrompt: buildSystemPrompt(disciplineText),
        tools: [...researchTools, ...buildResearchLibraryTools(rootDir)],
        transformContext: async (messages) => (await messageEngine.process(messages)).messages,
      };
    },
  };
}

const engine = createConversationEngine<AssistantChatDeps, "no_model" | "not_found">({
  layer: "assistant",
  logLabels: {
    persistFailure: "assistant chat: failed to persist partial response",
    preTurnFailure: "assistant chat: turn failed before model execution",
  },
  prepare: async (sessionId, _text, deps) => {
    if (!deps.model) return { ok: false, reason: "no_model" };
    const session = await getAssistantSession(sessionId, deps.db);
    if (!session) return { ok: false, reason: "not_found" };
    return { ok: true, turn: prepareTurn(sessionId, session, deps.model, deps) };
  },
});

export function onAssistantChatEvent(sessionId: string, listener: (event: ChatEvent) => void): () => void {
  return engine.onEvent(sessionId, listener);
}

export function assistantChatTurnState(sessionId: string): { busy: boolean; partial: string } {
  return engine.turnState(sessionId);
}

export function abortAssistantChatTurn(sessionId: string): boolean {
  return engine.abort(sessionId);
}

export function runAssistantChatTurn(
  sessionId: string,
  text: string,
  deps: AssistantChatDeps,
): Promise<AssistantChatStartResult> {
  return engine.run(sessionId, text, deps);
}
