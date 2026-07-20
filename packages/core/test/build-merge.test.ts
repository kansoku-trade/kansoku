import { describe, expect, it } from 'vitest';
import { mergeForPatch } from '../src/charts/build.js';

describe('mergeForPatch intraday', () => {
  it('merges session so a cash-session PATCH persists', () => {
    const input = { symbol: 'MRVL.US', session: 'all', prediction: null };
    const merged = mergeForPatch('intraday', input, { session: 'intraday', refresh: true });
    expect(merged.session).toBe('intraday');
  });

  it('keeps existing session when the PATCH omits it', () => {
    const input = { symbol: 'MRVL.US', session: 'intraday' };
    const merged = mergeForPatch('intraday', input, { prediction: { direction: 'long' } });
    expect(merged.session).toBe('intraday');
  });

  it('merges context onto the input', () => {
    const input = { symbol: 'MRVL.US', context: null };
    const context = {
      generated_at: '2026-07-05T14:00:00.000Z',
      conclusion: { stance: 'long', summary: 'x', action: 'y' },
      news: [],
      sources_used: [],
    };
    const merged = mergeForPatch('intraday', input, { context });
    expect(merged.context).toEqual(context);
  });

  it('leaves existing context untouched when the PATCH omits it', () => {
    const context = {
      generated_at: '2026-07-05T14:00:00.000Z',
      conclusion: { stance: 'long', summary: 'x', action: 'y' },
      news: [],
      sources_used: [],
    };
    const input = { symbol: 'MRVL.US', context };
    const merged = mergeForPatch('intraday', input, { title: 'new title' });
    expect(merged.context).toEqual(context);
  });
});
