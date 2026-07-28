// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { beginCursorLock, endCursorLock } from './cursorLock';

const locked = () => document.body.classList.contains('trainer-dragging-level');

afterEach(() => {
  // The counter is module state; drain it so one test cannot leave the next one pre-locked.
  for (let i = 0; i < 8; i += 1) endCursorLock();
});

describe('cursorLock', () => {
  it('locks on the first grab and releases on the matching drop', () => {
    expect(locked()).toBe(false);
    beginCursorLock();
    expect(locked()).toBe(true);
    endCursorLock();
    expect(locked()).toBe(false);
  });

  // The ticket handle and the line under it can both claim the same gesture; whichever releases
  // first must not drop the cursor while the other is still dragging.
  it('stays locked until the last holder lets go', () => {
    beginCursorLock();
    beginCursorLock();
    endCursorLock();
    expect(locked()).toBe(true);
    endCursorLock();
    expect(locked()).toBe(false);
  });

  // A release that never had a grab (an unmount cleanup firing after the pointer already came up)
  // must not drive the count negative, or the next real drag would start already unlocked.
  it('ignores an unmatched release instead of going negative', () => {
    endCursorLock();
    endCursorLock();
    beginCursorLock();
    expect(locked()).toBe(true);
    endCursorLock();
    expect(locked()).toBe(false);
  });
});
