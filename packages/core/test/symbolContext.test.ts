import { describe, expect, it } from 'vitest';
import type { ReassessPack } from '../src/ai/agents/datapack.js';
import { resolveSymbolContext } from '../src/ai/agents/symbolContext.js';

describe('resolveSymbolContext', () => {
  it('passes overrides through untouched', () => {
    const buildPack = async () => ({}) as unknown as ReassessPack;
    const fetchKline = async () => [];
    const fetchNews = async () => [];
    const ctx = resolveSymbolContext({ buildPack, fetchKline, fetchNews });
    expect(ctx.buildPack).toBe(buildPack);
    expect(ctx.fetchKline).toBe(fetchKline);
    expect(ctx.fetchNews).toBe(fetchNews);
  });

  it('fills missing entries with callable defaults', () => {
    const ctx = resolveSymbolContext();
    expect(typeof ctx.buildPack).toBe('function');
    expect(typeof ctx.fetchKline).toBe('function');
    expect(typeof ctx.fetchNews).toBe('function');
  });
});
