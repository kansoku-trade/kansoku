import { promises as fs } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  const dir = `${base}${sep}follows-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock('../src/platform/env.js', () => ({ CHART_DATA_DIR: ctx.dir }));

const { listFollowedSymbols, setSymbolFollowing, symbolFollowState } =
  await import('../src/ai/personas/follows.js');

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

describe('persistent symbol following', () => {
  it('normalizes and persists a followed symbol', () => {
    const started = setSymbolFollowing(
      'mu',
      true,
      undefined,
      () => new Date('2026-07-14T10:00:00.000Z'),
    );
    expect(started).toEqual({
      symbol: 'MU.US',
      following: true,
      startedAt: '2026-07-14T10:00:00.000Z',
    });
    expect(symbolFollowState('mu.us')).toEqual(started);
  });

  it('keeps the original start time when continue-following is selected twice', () => {
    setSymbolFollowing('NVDA.US', true, undefined, () => new Date('2026-07-14T10:00:00.000Z'));
    const second = setSymbolFollowing(
      'nvda',
      true,
      undefined,
      () => new Date('2026-07-14T11:00:00.000Z'),
    );
    expect(second.startedAt).toBe('2026-07-14T10:00:00.000Z');
  });

  it('removes a symbol when following is stopped', () => {
    setSymbolFollowing('AMD.US', true);
    expect(setSymbolFollowing('amd', false)).toEqual({
      symbol: 'AMD.US',
      following: false,
      startedAt: null,
    });
    expect(listFollowedSymbols()).not.toContain('AMD.US');
  });

  it('lists followed symbols in stable order', () => {
    expect(listFollowedSymbols()).toEqual(['MU.US', 'NVDA.US']);
  });
});
