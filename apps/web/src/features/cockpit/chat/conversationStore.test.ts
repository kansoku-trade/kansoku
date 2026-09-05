import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSpec } from '../../../lib/ws/wsHub';
import type { ChatLiveBeat } from './useChatSession';

const subscribeChannel = vi.fn();

vi.mock('../../../lib/ws/wsHub', () => ({
  subscribeChannel: (spec: unknown, onPayload: unknown, onConnected: unknown) =>
    subscribeChannel(spec, onPayload, onConnected),
}));
vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (spec: unknown, onPayload: unknown, onConnected: unknown) =>
    subscribeChannel(spec, onPayload, onConnected),
}));

const store = await import('./conversationStore.js');
type ConversationAdapter = import('./conversationStore.js').ConversationAdapter;

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
  unsub: ReturnType<typeof vi.fn>;
}

function envelope(
  partial: { busy?: boolean; partial?: string } = {},
): Awaited<ReturnType<ConversationAdapter['fetchChat']>> {
  return {
    session: { id: 's1', title: 't', createdAt: '', updatedAt: '' },
    messages: [],
    busy: partial.busy ?? false,
    partial: partial.partial ?? '',
  };
}

function fakeAdapter(
  fetchChat: ConversationAdapter['fetchChat'] = async () => envelope(),
): ConversationAdapter {
  return {
    fetchChat,
    send: async () => ({ status: 202, body: {} }),
    abort: async () => undefined,
    channel: (id) => ({ kind: 'assistant-chat', id }),
    suggest: null,
  };
}

describe('conversationStore', () => {
  let subs: Sub[];

  beforeEach(() => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation(
      (
        spec: ChannelSpec,
        onPayload: (payload: unknown) => void,
        onConnected: (connected: boolean) => void,
      ) => {
        const unsub = vi.fn();
        subs.push({ spec, onPayload, onConnected, unsub });
        return unsub;
      },
    );
    store.setConversationAdaptersForTests({
      assistant: fakeAdapter(),
      chart: fakeAdapter(),
      research: fakeAdapter(),
    });
  });

  afterEach(() => {
    store.resetConversationStoreForTests();
  });

  async function acquireAssistant(id = 's1') {
    store.acquire('assistant', id);
    await Promise.resolve();
    await Promise.resolve();
  }

  function liveTools(id = 's1'): ChatLiveBeat[] {
    return store.getConversationSnapshot('assistant', id)?.liveBeats ?? [];
  }

  it('keeps the slot subscribed after release while busy, and restores tools plus folds on acquire', async () => {
    const fetchChat = vi.fn(async () => envelope({}));
    store.setConversationAdaptersForTests({
      assistant: fakeAdapter(fetchChat),
      chart: fakeAdapter(),
      research: fakeAdapter(),
    });
    await acquireAssistant();
    expect(subscribeChannel).toHaveBeenCalledTimes(1);

    subs[0].onPayload({
      type: 'event',
      event: { event: 'tool', label: 'bash', status: 'start', input: '{"command":"ls"}' },
    });
    expect(liveTools().some((beat) => beat.kind === 'tool' && beat.tool.id === 'tool-0')).toBe(
      true,
    );

    store.toggleFold('assistant', 's1', 'tool:tool-0', false);
    expect(store.isFoldOpen('assistant', 's1', 'tool:tool-0', false)).toBe(true);

    store.release('assistant', 's1');
    expect(store.getConversationSnapshot('assistant', 's1')).not.toBeNull();
    expect(subs[0].unsub).not.toHaveBeenCalled();
    expect(fetchChat).toHaveBeenCalledTimes(1);

    store.acquire('assistant', 's1');
    expect(subscribeChannel).toHaveBeenCalledTimes(1);
    expect(fetchChat).toHaveBeenCalledTimes(1);
    expect(liveTools().some((beat) => beat.kind === 'tool' && beat.tool.id === 'tool-0')).toBe(
      true,
    );
    expect(store.isFoldOpen('assistant', 's1', 'tool:tool-0', false)).toBe(true);
  });

  it('disposes the slot when it goes idle with no viewers', async () => {
    vi.useFakeTimers();
    try {
      await acquireAssistant();
      subs[0].onPayload({
        type: 'event',
        event: { event: 'tool', label: 'bash', status: 'start' },
      });
      store.release('assistant', 's1');
      expect(store.getConversationSnapshot('assistant', 's1')).not.toBeNull();

      subs[0].onPayload({ type: 'event', event: { event: 'done' } });
      await vi.advanceTimersByTimeAsync(800);
      await Promise.resolve();
      await Promise.resolve();

      expect(store.getConversationSnapshot('assistant', 's1')).toBeNull();
      expect(subs[0].unsub).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps two busy slots independent', async () => {
    await acquireAssistant('a');
    await acquireAssistant('b');
    expect(subs).toHaveLength(2);

    subs[0].onPayload({
      type: 'event',
      event: { event: 'tool', label: 'bash', status: 'start', input: 'a' },
    });
    subs[1].onPayload({
      type: 'event',
      event: { event: 'tool', label: 'read_file', status: 'start', input: 'b' },
    });

    const toolsA = liveTools('a').filter((beat) => beat.kind === 'tool');
    const toolsB = liveTools('b').filter((beat) => beat.kind === 'tool');
    expect(toolsA).toHaveLength(1);
    expect(toolsB).toHaveLength(1);
    if (toolsA[0]?.kind === 'tool') expect(toolsA[0].tool.label).toBe('bash');
    if (toolsB[0]?.kind === 'tool') expect(toolsB[0].tool.label).toBe('read_file');
  });

  it('does not replace existing live tools with an empty init payload', async () => {
    await acquireAssistant();
    subs[0].onPayload({
      type: 'event',
      event: { event: 'tool', label: 'bash', status: 'start' },
    });
    subs[0].onPayload({ type: 'init', busy: true, partial: '' });
    expect(liveTools().some((beat) => beat.kind === 'tool')).toBe(true);
    expect(store.getConversationSnapshot('assistant', 's1')?.busy).toBe(true);
  });

  it('keeps live tools when the socket reports disconnected', async () => {
    await acquireAssistant();
    subs[0].onPayload({
      type: 'event',
      event: { event: 'tool', label: 'bash', status: 'start' },
    });
    subs[0].onConnected(false);
    expect(liveTools().some((beat) => beat.kind === 'tool')).toBe(true);
  });
});
