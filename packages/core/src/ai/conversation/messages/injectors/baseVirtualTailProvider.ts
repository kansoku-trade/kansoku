import type { MessagePipelineContext, MessageProcessor } from '../messageEngine.js';
import { createInjectedUserMessage, wrapSystemContext } from './systemContext.js';

export abstract class BaseVirtualTailProvider implements MessageProcessor {
  abstract readonly name: string;
  protected abstract buildContent(context: MessagePipelineContext): string | null;

  process(context: MessagePipelineContext): MessagePipelineContext {
    const content = this.buildContent(context);
    if (!content || context.messages.length === 0) return context;

    const messages = [...context.messages];
    const wrapped = wrapSystemContext(content);
    const last = messages.at(-1);
    if (!last) return context;
    messages.push(createInjectedUserMessage(wrapped, last.timestamp));

    return {
      ...context,
      messages,
      metadata: { ...context.metadata, [`${this.name}Injected`]: true },
    };
  }
}
