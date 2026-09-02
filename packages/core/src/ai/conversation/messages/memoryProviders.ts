import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { BasePinnedUserProvider } from '@innei/message-engine';
import type { ProAiMemory, ProAiMemoryScope } from '@kansoku/pro-api';
import type { FsReadMount, FsWriteMount } from '../../agents/agentTools/fsMounts.js';
import { proAiMemory } from '../../../pro/aiMemory.js';
import { BaseFirstUserContentProvider } from './injectors/baseFirstUserContentProvider.js';
import { wrapSystemContext } from './injectors/systemContext.js';
import type { MessagePipelineContext, MessageProcessor, MessageStep } from './messageEngine.js';

const warn = (what: string, error: unknown): void =>
  console.warn(`memory ${what} failed; continuing without it`, error);

export class MemoryIndexProvider extends BaseFirstUserContentProvider {
  readonly id = 'MemoryIndexProvider';
  private content: string | null | undefined;

  constructor(private readonly memory: ProAiMemory) {
    super();
  }

  override async process(context: MessagePipelineContext): Promise<void> {
    if (this.content === undefined) {
      this.content = await this.memory.indexContext().then(
        (text) => text ?? null,
        (error: unknown) => {
          warn('index', error);
          return null;
        },
      );
    }
    super.process(context);
  }

  protected buildContent(): string | null {
    return this.content ?? null;
  }
}

const scopeKey = (scope: ProAiMemoryScope): string => `${scope.symbol ?? ''}|${scope.market ?? ''}`;

export class MemoryScopeProvider<
  Initial = Record<string, never>,
  Step extends MessageStep = MessageStep,
  Services = Record<string, never>,
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> extends BasePinnedUserProvider<AgentMessage, Initial, Step, Services, Metadata> {
  readonly id = 'MemoryScopeProvider';
  private readonly cache = new Map<string, Promise<string | null>>();
  private lastPinnedKey: string | undefined;

  constructor(
    private readonly memory: ProAiMemory,
    private readonly fixedScope?: ProAiMemoryScope,
  ) {
    super({ cacheScope: 'turn', sourceType: 'knowledge' });
  }

  protected build(context: { step: Step }): Promise<string | null> {
    const scope: ProAiMemoryScope = this.fixedScope ?? {
      ...(context.step.symbol ? { symbol: context.step.symbol } : {}),
      ...(context.step.market ? { market: context.step.market } : {}),
    };
    if (!scope.symbol && !scope.market) return Promise.resolve(null);
    const key = scopeKey(scope);
    // A pinned section stays on the message it landed on; emit again only when the
    // scope changes, otherwise every later user message would get its own copy.
    if (key === this.lastPinnedKey) return Promise.resolve(null);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.memory.scopeContext(scope).then(
        (text) => (text ? wrapSystemContext(text) : null),
        (error: unknown) => {
          warn('scope', error);
          return null;
        },
      );
      this.cache.set(key, pending);
    }
    return pending.then((text) => {
      if (text) this.lastPinnedKey = key;
      return text;
    });
  }
}

export function memoryProcessors(fixedScope?: ProAiMemoryScope): MessageProcessor[] {
  const memory = proAiMemory();
  if (!memory) return [];
  return [new MemoryIndexProvider(memory), new MemoryScopeProvider(memory, fixedScope)];
}

export function memoryReadMounts(): FsReadMount[] {
  const mount = proAiMemory()?.readMount();
  return mount ? [{ ...mount }] : [];
}

export function memoryWriteMount(): FsWriteMount | undefined {
  const mount = proAiMemory()?.writeMount();
  return mount ? { ...mount } : undefined;
}
