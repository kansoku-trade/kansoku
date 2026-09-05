import { describe, expect, it } from 'vitest';
import {
  conversationAdapters,
  lastUserRow,
  postMessageInput,
  usageFromEnvelope,
  type ChatRow,
} from './useChatSession';

describe('conversationAdapters', () => {
  it('wires the assistant kind to the assistant-chat channel', () => {
    expect(conversationAdapters.assistant.channel('s1')).toEqual({
      kind: 'assistant-chat',
      id: 's1',
    });
  });

  it('wires the chart kind to the chat channel', () => {
    expect(conversationAdapters.chart.channel('c1')).toEqual({ kind: 'chat', id: 'c1' });
  });

  it('wires the research kind to the research-chat channel', () => {
    expect(conversationAdapters.research.channel('r1')).toEqual({
      kind: 'research-chat',
      path: 'r1',
    });
  });

  it('has no suggestions adapter for assistant', () => {
    expect(conversationAdapters.assistant.suggest).toBeNull();
  });

  it('has a suggestions adapter for chart and research', () => {
    expect(conversationAdapters.chart.suggest).not.toBeNull();
    expect(conversationAdapters.research.suggest).not.toBeNull();
  });
});

describe('lastUserRow', () => {
  it('returns the last user row with text', () => {
    const rows: ChatRow[] = [
      { id: 'u1', ts: 't', kind: 'user', text: 'a' },
      { id: 'a1', ts: 't', kind: 'assistant', text: 'b' },
      { id: 'u2', ts: 't', kind: 'user', text: 'c' },
      { id: 'e1', ts: 't', kind: 'error', text: 'fail' },
    ];
    expect(lastUserRow(rows)?.id).toBe('u2');
  });

  it('skips blank user rows', () => {
    const rows: ChatRow[] = [
      { id: 'u1', ts: 't', kind: 'user', text: 'a' },
      { id: 'u2', ts: 't', kind: 'user', text: '   ' },
    ];
    expect(lastUserRow(rows)?.id).toBe('u1');
  });
});

describe('postMessageInput', () => {
  it('omits replaceLast unless asked', () => {
    expect(postMessageInput('hi')).toEqual({ text: 'hi' });
    expect(postMessageInput('hi', { replaceLast: true })).toEqual({
      text: 'hi',
      replaceLast: true,
    });
  });
});

describe('usageFromEnvelope', () => {
  it('passes through usage when present', () => {
    const usage = { totalTokens: 120, costTotal: 0.03, calls: 4 };
    expect(usageFromEnvelope({ usage })).toEqual(usage);
  });

  it('returns null when usage is absent', () => {
    expect(usageFromEnvelope({})).toBeNull();
  });
});
