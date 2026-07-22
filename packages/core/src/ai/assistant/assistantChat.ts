import type { AiProvenance } from '@kansoku/shared/types';
import { PROJECT_ROOT } from '../../platform/env.js';
import type { Db } from '../../db/index.js';
import type { ExecFn } from '../agents/agentTools/execTool.js';
import { buildResearchTools } from '../agents/agentTools/researchTools.js';
import type { AiAgentFactory } from '../agents/agentSession.js';
import {
  appendAssistantMessages,
  type AssistantSession,
  getAssistantSession,
  listAssistantMessages,
} from './assistantChatStore.js';
import type { ChatEvent } from '../chat/chat.js';
import { type ConversationPreparedTurn, createConversationEngine } from '../conversation/conversationEngine.js';
import { MessagesEngine } from '../conversation/messages/messageEngine.js';
import { SkillCatalogProvider, toSkillContexts } from '../conversation/messages/sharedProviders.js';
import {
  composeWithDiscipline,
  DisciplineMissingError,
  loadSharedDiscipline,
} from '../runtime/promptPolicy.js';
import { buildProvenance } from '../runtime/provenance.js';
import { buildResearchLibraryTools } from '../agents/researchLibraryTools.js';
import { buildHypothesisTools } from '../agents/agentTools/hypothesisTools.js';
import type { AiModel } from '../runtime/models.js';
import { prepareProAiTurn } from '../../pro/aiExtension.js';

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
  | { started: false; reason: 'busy' | 'no_model' | 'not_found' }
  | { started: true; done: Promise<void> };

function buildSystemPrompt(disciplineText: string): string {
  const own = [
    "You are Kansoku's repository-level general research assistant. You are not attached to a chart or a research document.",
    'You have read-only bash access for the longbridge CLI and .claude/skills/**/scripts/*.py scripts to inspect market, macro, and file data. You can also read repository files and complete skills, and search and read research-library documents.',
    'When a user message contains an @path (for example, @stocks/MU.md), read that file with the file-reading tool before answering.',
    'Cite the file path for conclusions drawn from files, and state the retrieval timestamp when citing live data.',
    'register_hypothesis is for explicit user requests only; never register a hypothesis on your own initiative. Call list_hypotheses first to avoid duplicates.',
  ].join('\n');
  return composeWithDiscipline(disciplineText, own);
}

function prepareTurn(
  sessionId: string,
  session: AssistantSession,
  model: AiModel,
  deps: AssistantChatDeps,
): ConversationPreparedTurn {
  const rootDir = deps.rootDir ?? PROJECT_ROOT;
  let provenance: AiProvenance | undefined;
  return {
    model,
    agentFactory: deps.agentFactory,
    timeoutMs: deps.timeoutMs,
    store: {
      getSession: () => getAssistantSession(sessionId, deps.db),
      createSession: () => Promise.resolve(session),
      listMessages: (id) => listAssistantMessages(id, deps.db),
      appendMessages: (id, messages) =>
        appendAssistantMessages(id, messages, deps.db, provenance),
    },
    buildTurn: async (activeSessionId) => {
      const disciplineText = deps.disciplineText ?? loadSharedDiscipline(rootDir);
      if (!disciplineText) throw new DisciplineMissingError();
      provenance = buildProvenance(model, buildSystemPrompt(disciplineText));
      const proTurn = await prepareProAiTurn({
        surface: 'assistant',
        sessionId: activeSessionId,
      });
      const { tools: researchTools, skillIndex } = buildResearchTools({
        repoRoot: rootDir,
        exec: deps.exec,
        readMounts: proTurn.readMounts,
      });
      const messageEngine = new MessagesEngine([
        ...proTurn.processors,
        new SkillCatalogProvider(toSkillContexts(skillIndex)),
      ]);
      return {
        symbol: 'ASSISTANT',
        origin: 'assistant',
        systemPrompt: buildSystemPrompt(disciplineText),
        tools: [
          ...researchTools,
          ...buildResearchLibraryTools(rootDir),
          ...buildHypothesisTools(),
        ],
        transformContext: async (messages) => (await messageEngine.process(messages)).messages,
        onTurnComplete: proTurn.onTurnComplete,
      };
    },
  };
}

const engine = createConversationEngine<AssistantChatDeps, 'no_model' | 'not_found'>({
  layer: 'assistant',
  logLabels: {
    persistFailure: 'assistant chat: failed to persist partial response',
    preTurnFailure: 'assistant chat: turn failed before model execution',
  },
  prepare: async (sessionId, _text, deps) => {
    if (!deps.model) return { ok: false, reason: 'no_model' };
    const session = await getAssistantSession(sessionId, deps.db);
    if (!session) return { ok: false, reason: 'not_found' };
    return { ok: true, turn: prepareTurn(sessionId, session, deps.model, deps) };
  },
});

export function onAssistantChatEvent(
  sessionId: string,
  listener: (event: ChatEvent) => void,
): () => void {
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
