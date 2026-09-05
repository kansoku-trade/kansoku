import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { describe, expect, it } from 'vitest';
import { createDb } from '../src/db/index.js';
import { stripSentAt } from '../src/ai/conversation/conversationShared.js';
import {
  appendMessages,
  createSession,
  getSessionByChartId,
  listMessages,
  replaceLastUserTurn,
  titleFromText,
  updateTitle,
} from '../src/ai/chat/chatStore.js';

function userMessage(text: string): AgentMessage {
  return { role: 'user', content: text, timestamp: Date.now() };
}

function toolResultMessage(text: string): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId: 'call-1',
    toolName: 'example',
    content: [{ type: 'text', text }],
    isError: false,
    timestamp: Date.now(),
  };
}

function assistantMessage(text: string): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test-model',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

describe('chatStore sessions', () => {
  it('round-trips createSession/getSessionByChartId', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'hello' }, db);
    expect(session.chartId).toBe('c1');
    expect(session.symbol).toBe('MU.US');
    expect(session.title).toBe('hello');
    expect(session.createdAt).toBe(session.updatedAt);
    const found = await getSessionByChartId('c1', db);
    expect(found).toEqual(session);
  });

  it('returns null for an unknown chartId', async () => {
    const db = createDb(':memory:');
    expect(await getSessionByChartId('nope', db)).toBeNull();
  });

  it('throws on duplicate chartId', async () => {
    const db = createDb(':memory:');
    await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);
    await expect(
      createSession({ chartId: 'c1', symbol: 'MU.US', title: 'b' }, db),
    ).rejects.toThrow();
  });
});

describe('chatStore messages', () => {
  it('appends and lists messages, bumping updatedAt', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);

    const messages: AgentMessage[] = [userMessage('hi'), toolResultMessage('result')];
    await appendMessages(session.id, messages, db);

    const rows = await listMessages(session.id, db);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.role)).toEqual(['user', 'toolResult']);
    expect(rows[0].payload).toEqual(messages[0]);
    expect(rows[1].payload).toEqual(messages[1]);
    expect(typeof rows[0].payload).toBe('object');

    const updated = await getSessionByChartId('c1', db);
    expect(updated?.updatedAt).toBeDefined();
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(session.updatedAt).getTime(),
    );
  });

  it('keeps stable (ts, id) order for same-ts rows inserted in one call', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);

    const messages: AgentMessage[] = Array.from({ length: 5 }, (_, i) => userMessage(`msg-${i}`));
    await appendMessages(session.id, messages, db);

    const rows = await listMessages(session.id, db);
    expect(rows.map((r) => (r.payload as { content: string }).content)).toEqual([
      'msg-0',
      'msg-1',
      'msg-2',
      'msg-3',
      'msg-4',
    ]);
    const allSameTs = new Set(rows.map((r) => r.ts)).size === 1;
    expect(allSameTs).toBe(true);
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('no-ops on empty array without bumping updatedAt', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);
    await appendMessages(session.id, [], db);
    const untouched = await getSessionByChartId('c1', db);
    expect(untouched?.updatedAt).toBe(session.updatedAt);
    expect(await listMessages(session.id, db)).toEqual([]);
  });
});

describe('titleFromText', () => {
  it('leaves short input unchanged', () => {
    expect(titleFromText('hello world')).toBe('hello world');
  });

  it('trims and collapses internal whitespace runs', () => {
    expect(titleFromText('  hello   world  \n\t there  ')).toBe('hello world there');
  });

  it('truncates to 40 code points without cutting CJK surrogate pairs', () => {
    const cjk = '测'.repeat(50);
    const result = titleFromText(cjk);
    expect([...result]).toHaveLength(40);
    expect(result).toBe('测'.repeat(40));
  });

  it('truncates by code point, not UTF-16 code unit, for astral characters', () => {
    const astral = '😀'.repeat(50);
    const result = titleFromText(astral);
    expect([...result]).toHaveLength(40);
    expect(result).toBe('😀'.repeat(40));
  });
});

describe('chatStore replaceLastUserTurn', () => {
  it('returns no_user when the session has no user message', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);
    expect(await replaceLastUserTurn(session.id, 'hi', db)).toEqual({
      ok: false,
      reason: 'no_user',
    });
  });

  it('deletes messages after the last user and rewrites that user payload', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);
    const first = userMessage('first');
    await appendMessages(
      session.id,
      [
        first,
        assistantMessage('ok'),
        userMessage('second'),
        assistantMessage('later'),
        toolResultMessage('tool'),
      ],
      db,
    );

    const result = await replaceLastUserTurn(session.id, 'second edited', db);
    expect(result).toEqual({ ok: true, isFirstUser: false });

    const rows = await listMessages(session.id, db);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.role)).toEqual(['user', 'assistant', 'user']);
    const rewritten = rows[2].payload;
    expect(rewritten.role).toBe('user');
    if (rewritten.role !== 'user' || typeof rewritten.content !== 'string') {
      throw new Error('expected user text');
    }
    expect(stripSentAt(rewritten.content)).toBe('second edited');
    expect(rows[0].payload).toEqual(first);
  });

  it('marks isFirstUser when the last user is also the first', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);
    await appendMessages(session.id, [userMessage('only'), assistantMessage('ok')], db);
    expect(await replaceLastUserTurn(session.id, 'only', db)).toEqual({
      ok: true,
      isFirstUser: true,
    });
    expect(await listMessages(session.id, db)).toHaveLength(1);
  });
});

describe('chatStore updateTitle', () => {
  it('rewrites title and bumps updatedAt', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'old' }, db);
    await updateTitle(session.id, 'new title', db);
    const found = await getSessionByChartId('c1', db);
    expect(found?.title).toBe('new title');
    expect(new Date(found!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(session.updatedAt).getTime(),
    );
  });
});
