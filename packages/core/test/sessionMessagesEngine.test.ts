import { afterEach, describe, expect, it } from 'vitest';
import {
  disposeSessionMessagesEngine,
  resetSessionMessagesEnginesForTests,
  sessionMessagesEngine,
} from '../src/ai/conversation/messages/messageEngine.js';
import { stampSentAt, stripSentAt } from '../src/ai/conversation/conversationShared.js';

describe('sessionMessagesEngine', () => {
  afterEach(() => resetSessionMessagesEnginesForTests());

  it('reuses one engine per session and builds processors once', () => {
    let builds = 0;
    const factory = () => {
      builds += 1;
      return [];
    };
    const first = sessionMessagesEngine('s1', factory);
    const second = sessionMessagesEngine('s1', factory);
    expect(second).toBe(first);
    expect(builds).toBe(1);
    expect(sessionMessagesEngine('s2', factory)).not.toBe(first);
    expect(builds).toBe(2);
  });

  it('creates a fresh engine after dispose', () => {
    const first = sessionMessagesEngine('s1', () => []);
    disposeSessionMessagesEngine('s1');
    expect(sessionMessagesEngine('s1', () => [])).not.toBe(first);
  });

  it('evicts the least recently used session past the cap', () => {
    const first = sessionMessagesEngine('s0', () => []);
    for (let index = 1; index <= 32; index += 1) sessionMessagesEngine(`s${index}`, () => []);
    expect(sessionMessagesEngine('s0', () => [])).not.toBe(first);
  });
});

describe('sent_at stamp', () => {
  it('round-trips through strip', () => {
    const stamped = stampSentAt('买还是卖', 0);
    expect(stamped).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC[+-]\d{2}:\d{2}\] 买还是卖$/u);
    expect(stripSentAt(stamped)).toBe('买还是卖');
    expect(stripSentAt('[not a stamp] 买还是卖')).toBe('[not a stamp] 买还是卖');
  });
});
