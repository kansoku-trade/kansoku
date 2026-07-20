import type { MessagePipelineContext, MessageProcessor } from '../messageEngine.js';
import {
  appendSystemContext,
  createInjectedUserMessage,
  wrapSystemContext,
} from './systemContext.js';

export abstract class BaseFirstUserContentProvider implements MessageProcessor {
  abstract readonly name: string;
  protected abstract buildContent(context: MessagePipelineContext): string | null;

  process(context: MessagePipelineContext): MessagePipelineContext {
    const content = this.buildContent(context);
    if (!content) return context;

    const messages = [...context.messages];
    let injectionIndex = context.firstUserInjectionIndex;
    if (injectionIndex == null) {
      const firstUserIndex = messages.findIndex(
        (message, index) =>
          index > (context.afterSystemPromptInjectionIndex ?? -1) && message.role === 'user',
      );
      if (firstUserIndex === -1) return context;
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

    return {
      ...context,
      firstUserInjectionIndex: injectionIndex,
      messages,
      metadata: { ...context.metadata, [`${this.name}Injected`]: true },
    };
  }
}
