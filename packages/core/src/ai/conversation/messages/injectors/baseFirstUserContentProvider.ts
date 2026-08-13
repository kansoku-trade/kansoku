import type { MessagePipelineContext, MessageProcessor } from '../messageEngine.js';
import {
  appendSystemContext,
  createInjectedUserMessage,
  wrapSystemContext,
} from './systemContext.js';

export abstract class BaseFirstUserContentProvider implements MessageProcessor {
  readonly access = { reads: ['all'] as const, writes: 'structure' as const };
  abstract readonly id: string;
  readonly phase = 'stable-context' as const;
  protected abstract buildContent(context: MessagePipelineContext): string | null;

  process(context: MessagePipelineContext): void {
    const content = this.buildContent(context);
    if (!content) return;

    const messages = [...context.messages];
    let injectionIndex = context.metadata.firstUserInjectionIndex;
    if (injectionIndex == null) {
      const firstUserIndex = messages.findIndex(
        (message, index) =>
          index > (context.metadata.afterSystemPromptInjectionIndex ?? -1) &&
          message.role === 'user',
      );
      if (firstUserIndex === -1) return;
      const firstUser = messages[firstUserIndex];
      messages.splice(
        firstUserIndex,
        0,
        createInjectedUserMessage(wrapSystemContext(content), firstUser.timestamp),
      );
      injectionIndex = firstUserIndex;
    } else {
      messages[injectionIndex] = appendSystemContext(messages[injectionIndex], content);
    }

    context.replaceMessages(messages);
    context.setMetadata('firstUserInjectionIndex', injectionIndex);
    context.setMetadata(`${this.id}Injected`, true);
  }
}
