import { describe, expect, it } from 'vitest';
import type { Notice } from '@kansoku/shared/types';
import { emitNotice, onAnyNotice, onNotice } from '../src/ai/personas/notices.js';

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    symbol: 'MU.US',
    kind: 'analysis_done',
    title: 'title',
    body: 'body',
    at: '2026-07-07T15:00:00.000Z',
    ...overrides,
  };
}

describe('notice hub', () => {
  it('delivers notices to an application-wide listener', () => {
    const received: Notice[] = [];
    const unsub = onAnyNotice((n) => received.push(n));
    emitNotice(notice({ symbol: 'GLOBAL.US', title: 'background done' }));
    expect(received.map((n) => n.title)).toEqual(['background done']);
    unsub();
  });

  it('delivers an emitted notice to a listener for the same symbol', () => {
    const received: Notice[] = [];
    const unsub = onNotice('NOT1.US', (n) => received.push(n));
    emitNotice(notice({ symbol: 'NOT1.US', title: 'hello' }));
    expect(received.map((n) => n.title)).toEqual(['hello']);
    unsub();
  });

  it('stops delivery after unsubscribe', () => {
    const received: Notice[] = [];
    const unsub = onNotice('NOT2.US', (n) => received.push(n));
    unsub();
    emitNotice(notice({ symbol: 'NOT2.US' }));
    expect(received).toHaveLength(0);
  });

  it('does not deliver to a listener for another symbol', () => {
    const received: Notice[] = [];
    const unsub = onNotice('NOT3.US', (n) => received.push(n));
    emitNotice(notice({ symbol: 'OTHER.US' }));
    expect(received).toHaveLength(0);
    unsub();
  });

  it('delivers a bare symbol emit to a listener registered with the .US suffix', () => {
    const received: Notice[] = [];
    const unsub = onNotice('MU.US', (n) => received.push(n));
    emitNotice(notice({ symbol: 'MU' }));
    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe('MU.US');
    unsub();
  });

  it('normalizes case and suffix consistently between emit and listen', () => {
    const received: Notice[] = [];
    const unsub = onNotice('MU.US', (n) => received.push(n));
    emitNotice(notice({ symbol: 'mu.us' }));
    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe('MU.US');
    unsub();
  });
});
