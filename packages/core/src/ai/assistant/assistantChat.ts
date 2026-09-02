import { CANVAS_DIR, PROJECT_ROOT } from '../../platform/env.js';
import {
  CANVAS_SKILL_NAME,
  buildCanvasApplyPatchTool,
  buildCanvasTools,
  transcriptHasSkillRead,
} from '../../canvas/tools.js';
import type { Db } from '../../db/index.js';
import type { ExecFn } from '../agents/agentTools/execTool.js';
import { buildResearchTools } from '../agents/agentTools/researchTools.js';
import type { AiAgentFactory } from '../agents/agentSession.js';
import {
  appendAssistantMessages,
  assignGeneratedAssistantTitle,
  type AssistantSession,
  getAssistantSession,
  listAssistantMessages,
} from './assistantChatStore.js';
import {
  generateSessionTitle,
  sanitizeGeneratedTitle,
  shouldAssignGeneratedTitle,
} from './sessionTitle.js';
import { titleFromText } from '../conversation/conversationStore.js';
import { aiConfig } from '../runtime/models.js';
import type { ChatEvent } from '../chat/chat.js';
import {
  type ConversationPreparedTurn,
  createConversationEngine,
} from '../conversation/conversationEngine.js';
import { memoryProcessors, memoryReadMounts } from '../conversation/messages/memoryProviders.js';
import { sessionMessagesEngine } from '../conversation/messages/messageEngine.js';
import { SkillCatalogProvider, toSkillContexts } from '../conversation/messages/sharedProviders.js';
import {
  composeWithDiscipline,
  DisciplineMissingError,
  loadSharedDiscipline,
} from '../runtime/promptPolicy.js';
import { buildResearchLibraryTools } from '../agents/researchLibraryTools.js';
import type { AiModel } from '../runtime/models.js';

export interface AssistantChatDeps {
  model: AiModel | null;
  titleModel?: AiModel | null;
  generateTitle?: (text: string) => Promise<string>;
  rootDir?: string;
  db?: Db;
  agentFactory?: AiAgentFactory;
  titleAgentFactory?: AiAgentFactory;
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
    'When the user wants a custom chart or panel: read_skill(name="canvas") first — its layout skeleton is mandatory and save_canvas refuses until you have read it. Then fetch the numbers, embed them, and call save_canvas. To revise an existing canvas, read its journal/canvases/*.canvas.tsx path with read_file, then change it with one apply_patch call that carries every hunk. Free builds may keep at most 3 canvases; overwriting an existing slug is always allowed.',
    'When a user message contains an @path (for example, @stocks/MU.md), read that file with the file-reading tool before answering.',
    'Cite the file path for conclusions drawn from files, and state the retrieval timestamp when citing live data.',
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
  return {
    model,
    agentFactory: deps.agentFactory,
    store: {
      getSession: () => getAssistantSession(sessionId, deps.db),
      createSession: () => Promise.resolve(session),
      listMessages: (id) => listAssistantMessages(id, deps.db),
      appendMessages: (id, messages) => appendAssistantMessages(id, messages, deps.db),
    },
    buildTurn: async (activeSessionId) => {
      const disciplineText = deps.disciplineText ?? loadSharedDiscipline(rootDir);
      if (!disciplineText) throw new DisciplineMissingError();
      const loadedSkills = new Set<string>();
      const canvasSkillInTranscript = transcriptHasSkillRead(
        (await listAssistantMessages(activeSessionId, deps.db)).map((row) => row.payload),
        CANVAS_SKILL_NAME,
      );
      const canvasSkillLoaded = () =>
        canvasSkillInTranscript || loadedSkills.has(CANVAS_SKILL_NAME);
      const { tools: researchTools, skillIndex } = buildResearchTools({
        repoRoot: rootDir,
        exec: deps.exec,
        readMounts: memoryReadMounts(),
        onSkillRead: (name) => loadedSkills.add(name),
      });
      const messageEngine = sessionMessagesEngine(activeSessionId, () => [
        ...memoryProcessors(),
        new SkillCatalogProvider(toSkillContexts(skillIndex)),
      ]);
      return {
        symbol: 'ASSISTANT',
        origin: 'assistant',
        systemPrompt: buildSystemPrompt(disciplineText),
        tools: [
          ...researchTools,
          ...buildResearchLibraryTools(rootDir),
          ...buildCanvasTools(CANVAS_DIR, {
            skillLoaded: canvasSkillLoaded,
          }),
          buildCanvasApplyPatchTool(rootDir, CANVAS_DIR, {
            skillLoaded: canvasSkillLoaded,
          }),
        ],
        transformContext: messageEngine.transformContext,
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

function resolveTitleModel(deps: AssistantChatDeps): AiModel | null {
  if (deps.titleModel !== undefined) return deps.titleModel;
  try {
    return aiConfig().titleModel;
  } catch {
    return null;
  }
}

async function assignSessionTitle(
  sessionId: string,
  text: string,
  deps: AssistantChatDeps,
): Promise<void> {
  const session = await getAssistantSession(sessionId, deps.db);
  if (!session || !shouldAssignGeneratedTitle(session.title)) return;

  const fallback = titleFromText(text);
  let title = fallback;
  try {
    title = deps.generateTitle
      ? sanitizeGeneratedTitle(await deps.generateTitle(text), fallback)
      : await generateSessionTitle(text, {
          model: resolveTitleModel(deps),
          agentFactory: deps.titleAgentFactory,
        });
  } catch (error) {
    console.warn('assistant chat: title generation failed', error);
    title = fallback;
  }

  const updated = await assignGeneratedAssistantTitle(sessionId, title, deps.db);
  if (updated?.title === title) {
    engine.emit(sessionId, { event: 'title', title });
  }
}

export async function runAssistantChatTurn(
  sessionId: string,
  text: string,
  deps: AssistantChatDeps,
): Promise<AssistantChatStartResult> {
  const result = await engine.run(sessionId, text, deps);
  if (!result.started) return result;
  const titled = assignSessionTitle(sessionId, text, deps).catch((error) => {
    console.warn('assistant chat: title generation failed', error);
  });
  return { started: true, done: Promise.all([result.done, titled]).then(() => undefined) };
}
