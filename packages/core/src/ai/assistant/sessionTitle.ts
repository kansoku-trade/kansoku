import { type AiAgentFactory, createAgentSession } from '../agents/agentSession.js';
import { concatAssistantText } from '../conversation/conversationShared.js';
import { titleFromText } from '../conversation/conversationStore.js';
import type { AiModel } from '../runtime/models.js';

export const DEFAULT_ASSISTANT_TITLE = '新对话';
export const TITLE_MAX_CHARS = 40;
const TITLE_TIMEOUT_MS = 15_000;

const TITLE_PROMPT = [
  'You name Kansoku assistant conversations.',
  'Write a short title for the user message.',
  'Rules: 8-20 characters, no quotes, no markdown, no explanation, match the user language.',
].join('\n');

export function shouldAssignGeneratedTitle(title: string): boolean {
  return title === DEFAULT_ASSISTANT_TITLE;
}

export function sanitizeGeneratedTitle(raw: string, fallback: string): string {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? '';
  const stripped = firstLine
    .replaceAll(/[*_`#]/g, '')
    .replaceAll(/^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/g, '')
    .trim()
    .replaceAll(/\s+/g, ' ');
  const clipped = [...stripped].slice(0, TITLE_MAX_CHARS).join('');
  return clipped || fallback;
}

export interface GenerateSessionTitleDeps {
  model: AiModel | null;
  agentFactory?: AiAgentFactory;
  timeoutMs?: number;
}

export async function generateSessionTitle(
  text: string,
  deps: GenerateSessionTitleDeps,
): Promise<string> {
  const fallback = titleFromText(text);
  if (!deps.model) return fallback;

  try {
    const session = createAgentSession({
      layer: 'session-title',
      symbol: 'ASSISTANT',
      model: deps.model,
      systemPrompt: TITLE_PROMPT,
      tools: [],
      agentFactory: deps.agentFactory,
    });
    await session.runTurn(text, deps.timeoutMs ?? TITLE_TIMEOUT_MS);
    const messages = session.agent.state?.messages ?? [];
    const last = messages.at(-1);
    const raw = last ? concatAssistantText(last) : '';
    return sanitizeGeneratedTitle(raw, fallback);
  } catch {
    return fallback;
  }
}
