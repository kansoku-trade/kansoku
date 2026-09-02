import { describe, expect, it } from 'vitest';
import { cacheHitRate, formatUsageLine, usageFromRows } from './formatChatUsage.js';
import type { ChatRow } from './useChatSession';

describe('usageFromRows', () => {
  it('sums token, cost, and cache fields from assistant meta', () => {
    const rows: ChatRow[] = [
      { id: 'u1', ts: '', kind: 'user', text: '问' },
      {
        id: 'a1',
        ts: '',
        kind: 'assistant',
        text: '答',
        meta: {
          provider: 'anthropic',
          model: 'x',
          totalTokens: 1200,
          costTotal: 0.0312,
          input: 200,
          output: 200,
          cacheRead: 800,
          cacheWrite: 0,
        },
      },
    ];
    expect(usageFromRows(rows)).toEqual({
      totalTokens: 1200,
      costTotal: 0.0312,
      calls: 1,
      input: 200,
      output: 200,
      cacheRead: 800,
      cacheWrite: 0,
    });
  });

  it('returns null when no message has usage meta', () => {
    expect(usageFromRows([{ id: 'u1', ts: '', kind: 'user', text: '问' }])).toBeNull();
  });
});

describe('cacheHitRate', () => {
  it('is cacheRead over input plus cacheRead', () => {
    expect(cacheHitRate({ totalTokens: 1000, costTotal: 0, calls: 1, input: 200, cacheRead: 800 })).toBe(
      80,
    );
  });

  it('is null when nothing was served from cache', () => {
    expect(cacheHitRate({ totalTokens: 100, costTotal: 0, calls: 1, input: 100, cacheRead: 0 })).toBeNull();
  });
});

describe('formatUsageLine', () => {
  it('includes tokens, cost, and cache hit when present', () => {
    const line = formatUsageLine({
      totalTokens: 1200,
      costTotal: 0.0312,
      calls: 1,
      input: 200,
      cacheRead: 800,
    });
    expect(line).toContain('tok');
    expect(line).toContain('$');
    expect(line).toContain('cache 80%');
  });

  it('omits cache when there is no hit', () => {
    const line = formatUsageLine({ totalTokens: 40, costTotal: 0.01, calls: 1, input: 40 });
    expect(line).toContain('tok');
    expect(line).not.toContain('cache');
  });
});
