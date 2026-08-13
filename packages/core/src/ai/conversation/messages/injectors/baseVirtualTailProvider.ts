import type { MessagePipelineContext, MessageProcessor } from '../messageEngine.js';
import { createInjectedUserMessage, wrapSystemContext } from './systemContext.js';

export abstract class BaseVirtualTailProvider implements MessageProcessor {
  readonly access = { reads: ['all'] as const, writes: 'structure' as const };
  abstract readonly id: string;
  readonly phase = 'virtual-tail' as const;
  protected abstract buildContent(context: MessagePipelineContext): string | null;

  process(context: MessagePipelineContext): void {
    const content = this.buildContent(context);
    if (!content || context.messages.length === 0) return;

    const messages = [...context.messages];
    const wrapped = wrapSystemContext(content);
    const last = messages.at(-1);
    if (!last) return;
    messages.push(createInjectedUserMessage(wrapped, last.timestamp));

    context.replaceMessages(messages);
    context.setMetadata(`${this.id}Injected`, true);
  }
}
