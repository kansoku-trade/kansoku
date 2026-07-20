import { describe, expect, it } from 'vitest';
import { createRunLock } from '../src/ai/agents/runLock.js';

describe('createRunLock', () => {
  it('acquires a free key and reports it as locked', () => {
    const lock = createRunLock();
    expect(lock.isLocked('MU.US')).toBe(false);
    expect(lock.tryAcquire('MU.US')).toBe(true);
    expect(lock.isLocked('MU.US')).toBe(true);
  });

  it('fails to acquire an already-locked key', () => {
    const lock = createRunLock();
    expect(lock.tryAcquire('MU.US')).toBe(true);
    expect(lock.tryAcquire('MU.US')).toBe(false);
  });

  it('allows re-acquiring a key after release', () => {
    const lock = createRunLock();
    expect(lock.tryAcquire('MU.US')).toBe(true);
    lock.release('MU.US');
    expect(lock.isLocked('MU.US')).toBe(false);
    expect(lock.tryAcquire('MU.US')).toBe(true);
  });

  it('keeps locks independent per key', () => {
    const lock = createRunLock();
    expect(lock.tryAcquire('MU.US')).toBe(true);
    expect(lock.tryAcquire('NVDA.US')).toBe(true);
    expect(lock.isLocked('MU.US')).toBe(true);
    expect(lock.isLocked('NVDA.US')).toBe(true);
    lock.release('MU.US');
    expect(lock.isLocked('MU.US')).toBe(false);
    expect(lock.isLocked('NVDA.US')).toBe(true);
  });

  it('releasing an unlocked key is a no-op', () => {
    const lock = createRunLock();
    expect(() => lock.release('MU.US')).not.toThrow();
    expect(lock.isLocked('MU.US')).toBe(false);
  });
});
