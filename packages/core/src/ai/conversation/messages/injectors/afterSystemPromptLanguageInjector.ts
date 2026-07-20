import type { MessagePipelineContext, MessageProcessor } from '../messageEngine.js';
import { createInjectedUserMessage, wrapSystemContext } from './systemContext.js';

/**
 * This remains a temporary constant until the UI locale is available to the
 * backend turn builder. Keeping it here makes every Message Engine surface use
 * the same output-language policy.
 */
export const CURRENT_INTERFACE_LANGUAGE = 'Simplified Chinese';

/**
 * Inserts runtime instructions as the first provider-facing message. The agent
 * sends its configured system prompt before this transcript, so this is the
 * explicit "after system prompt" injection point for every MessagesEngine.
 */
export class AfterSystemPromptLanguageInjector implements MessageProcessor {
  readonly name = 'AfterSystemPromptLanguageInjector';

  process(context: MessagePipelineContext): MessagePipelineContext {
    const timestamp = context.messages[0]?.timestamp ?? 0;
    const content = [
      '<interface_language>',
      `The current interface language is ${CURRENT_INTERFACE_LANGUAGE}.`,
      'Generate all natural-language content in this language, not only chat replies.',
      'This includes document bodies, research notes, journals, summaries, edit proposals, annotations, and natural-language fields passed to tools.',
      'Keep source code, identifiers, file paths, tool names, and verbatim quoted source text unchanged unless the user explicitly requests translation.',
      '</interface_language>',
    ].join('\n');

    return {
      ...context,
      afterSystemPromptInjectionIndex: 0,
      messages: [
        createInjectedUserMessage(wrapSystemContext(content), timestamp),
        ...context.messages,
      ],
      metadata: { ...context.metadata, [`${this.name}Injected`]: true },
    };
  }
}
