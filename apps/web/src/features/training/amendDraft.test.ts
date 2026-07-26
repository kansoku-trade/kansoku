import { describe, expect, it } from 'vitest';
import { clampAmendStop, clampAmendTarget, widensStop } from './amendDraft';

describe('widensStop', () => {
  it('flags a long stop moving down as a widen, up or unchanged as not', () => {
    expect(widensStop('long', 99, 98)).toBe(true);
    expect(widensStop('long', 99, 99)).toBe(false);
    expect(widensStop('long', 99, 100)).toBe(false);
  });

  it('flags a short stop moving up as a widen, down or unchanged as not', () => {
    expect(widensStop('short', 101, 102)).toBe(true);
    expect(widensStop('short', 101, 101)).toBe(false);
    expect(widensStop('short', 101, 100)).toBe(false);
  });
});

describe('clampAmendStop — long', () => {
  const currentStop = 99;
  const reference = 101;

  it('allows tightening to breakeven', () => {
    expect(clampAmendStop('long', reference, currentStop, 100)).toBe(100);
  });

  it('allows tightening above breakeven', () => {
    expect(clampAmendStop('long', reference, currentStop, 100.5)).toBe(100.5);
  });

  it('rejects widening back into loss by holding the current stop', () => {
    expect(clampAmendStop('long', reference, currentStop, 98)).toBe(currentStop);
  });

  it('also clamps to stay below the current reference price', () => {
    expect(clampAmendStop('long', reference, currentStop, 102)).toBe(100.99);
  });
});

describe('clampAmendStop — short', () => {
  const currentStop = 101;
  const reference = 99;

  it('allows tightening to breakeven', () => {
    expect(clampAmendStop('short', reference, currentStop, 100)).toBe(100);
  });

  it('allows tightening above breakeven', () => {
    expect(clampAmendStop('short', reference, currentStop, 99.5)).toBe(99.5);
  });

  it('rejects widening back into loss by holding the current stop', () => {
    expect(clampAmendStop('short', reference, currentStop, 101.5)).toBe(currentStop);
  });

  it('also clamps to stay above the current reference price', () => {
    expect(clampAmendStop('short', reference, currentStop, 98)).toBe(99.01);
  });
});

describe('clampAmendTarget', () => {
  it('keeps a long target above the reference price', () => {
    expect(clampAmendTarget('long', 101, 99)).toBe(101.01);
    expect(clampAmendTarget('long', 101, 105)).toBe(105);
  });

  it('keeps a short target below the reference price', () => {
    expect(clampAmendTarget('short', 99, 101)).toBe(98.99);
    expect(clampAmendTarget('short', 99, 95)).toBe(95);
  });
});
