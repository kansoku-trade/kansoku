import { describe, expect, it } from 'vitest';
import {
  assistantMessageSchema,
  assistantTitleSchema,
} from '../src/ai/assistant/assistantInput.js';

describe('assistantTitleSchema', () => {
  it('trims and accepts a short title', () => {
    expect(assistantTitleSchema.parse('  MU 盘前  ')).toBe('MU 盘前');
  });

  it('rejects a blank title', () => {
    expect(() => assistantTitleSchema.parse('   ')).toThrow();
  });

  it('rejects a title longer than 40 characters', () => {
    expect(() => assistantTitleSchema.parse('a'.repeat(41))).toThrow();
  });
});

describe('assistantMessageSchema', () => {
  it('trims and accepts a message', () => {
    expect(assistantMessageSchema.parse('  你好  ')).toBe('你好');
  });

  it('rejects empty or overly long text', () => {
    expect(() => assistantMessageSchema.parse('')).toThrow();
    expect(() => assistantMessageSchema.parse('a'.repeat(4001))).toThrow();
  });
});
