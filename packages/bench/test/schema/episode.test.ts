import { describe, expect, it } from 'vitest';
import type { TSchema } from 'typebox';
import { Value } from 'typebox/value';
import {
  episodeTradeActionSchema,
  episodeTradeActionToolSchema,
} from '../../src/schema/episode.js';

const variants = (
  episodeTradeActionSchema as unknown as {
    anyOf: Array<{ properties: Record<string, { const?: string }> }>;
  }
).anyOf;
const tool = episodeTradeActionToolSchema as unknown as {
  type: string;
  properties: Record<string, TSchema>;
};

describe('episodeTradeActionToolSchema', () => {
  it('is a single top-level object, as OpenAI-compatible function schemas require', () => {
    expect(tool.type).toBe('object');
  });

  it('exposes every field and every action of the strict union', () => {
    for (const variant of variants) {
      for (const field of Object.keys(variant.properties)) {
        expect(Object.keys(tool.properties)).toContain(field);
      }
      expect(Value.Check(tool.properties.type, variant.properties.type.const)).toBe(true);
    }
  });

  it('accepts a hold batch and an amend the strict union also accepts', () => {
    const hold = { type: 'hold', bars: 4, period: 'day' };
    const amend = {
      type: 'amend',
      stop: 98.4,
      reason: { category: 'profit_protection', summary: 'trail stop to breakeven at B37' },
    };
    for (const action of [hold, amend]) {
      expect(Value.Check(episodeTradeActionToolSchema, action)).toBe(true);
      expect(Value.Check(episodeTradeActionSchema, action)).toBe(true);
    }
  });

  it('leaves cross-action field mixing for the runtime union check to reject', () => {
    const mixed = { type: 'cancel', bars: 3 };
    expect(Value.Check(episodeTradeActionToolSchema, mixed)).toBe(true);
    expect(Value.Check(episodeTradeActionSchema, mixed)).toBe(false);
  });

  it('accepts every ladder period alongside the h1 sentinel', () => {
    for (const period of ['h1', '1m', '5m', '15m', '30m', '1h', 'day', 'week']) {
      const hold = { type: 'hold', period };
      expect(Value.Check(episodeTradeActionSchema, hold)).toBe(true);
      expect(Value.Check(episodeTradeActionToolSchema, hold)).toBe(true);
    }
  });

  it('rejects a period that is not a recognised period name', () => {
    const hold = { type: 'hold', period: '2h' };
    expect(Value.Check(episodeTradeActionSchema, hold)).toBe(false);
    expect(Value.Check(episodeTradeActionToolSchema, hold)).toBe(false);
  });
});
