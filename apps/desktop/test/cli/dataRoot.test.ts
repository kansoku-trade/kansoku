import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveDataRoot } from '@desktop/cli/dataRoot.js';

describe('resolveDataRoot', () => {
  const originalKansokuDataRoot = process.env.KANSOKU_DATA_ROOT;
  const originalTradeProjectRoot = process.env.TRADE_PROJECT_ROOT;

  beforeEach(() => {
    delete process.env.KANSOKU_DATA_ROOT;
    delete process.env.TRADE_PROJECT_ROOT;
  });

  afterEach(() => {
    if (originalKansokuDataRoot === undefined) delete process.env.KANSOKU_DATA_ROOT;
    else process.env.KANSOKU_DATA_ROOT = originalKansokuDataRoot;
    if (originalTradeProjectRoot === undefined) delete process.env.TRADE_PROJECT_ROOT;
    else process.env.TRADE_PROJECT_ROOT = originalTradeProjectRoot;
  });

  it('uses the --data-root flag and sets TRADE_PROJECT_ROOT', () => {
    const root = resolveDataRoot(['--data-root', '/tmp/a']);
    expect(root).toBe('/tmp/a');
    expect(process.env.TRADE_PROJECT_ROOT).toBe('/tmp/a');
  });

  it('falls back to KANSOKU_DATA_ROOT and sets TRADE_PROJECT_ROOT', () => {
    process.env.KANSOKU_DATA_ROOT = '/tmp/b';
    const root = resolveDataRoot([]);
    expect(root).toBe('/tmp/b');
    expect(process.env.TRADE_PROJECT_ROOT).toBe('/tmp/b');
  });

  it('falls back to an existing TRADE_PROJECT_ROOT when nothing else is set', () => {
    process.env.TRADE_PROJECT_ROOT = '/tmp/c';
    const root = resolveDataRoot([]);
    expect(root).toBe('/tmp/c');
  });

  it('prefers the flag over both environment variables', () => {
    process.env.KANSOKU_DATA_ROOT = '/tmp/b';
    process.env.TRADE_PROJECT_ROOT = '/tmp/c';
    const root = resolveDataRoot(['--data-root', '/tmp/a']);
    expect(root).toBe('/tmp/a');
    expect(process.env.TRADE_PROJECT_ROOT).toBe('/tmp/a');
  });
});
