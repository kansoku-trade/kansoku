import { describe, expect, it } from 'vitest';
import type { AssistantSessionMeta } from '@kansoku/core/contract/index';
import {
  groupSessionsByRecency,
  isBlankSession,
  sessionDisplayTitle,
  sessionGroupKey,
} from './sessionGroups';

const now = new Date('2026-09-02T18:30:00+08:00');

const session = (id: string, updatedAt: string): AssistantSessionMeta => ({
  id,
  title: id,
  createdAt: updatedAt,
  updatedAt,
  busy: false,
  messageCount: 1,
  preview: null,
});

describe('sessionGroupKey', () => {
  it('splits by local calendar day', () => {
    expect(sessionGroupKey('2026-09-02T00:30:00+08:00', now)).toBe('today');
    expect(sessionGroupKey('2026-09-01T23:30:00+08:00', now)).toBe('yesterday');
    expect(sessionGroupKey('2026-08-28T12:00:00+08:00', now)).toBe('week');
    expect(sessionGroupKey('2026-08-20T12:00:00+08:00', now)).toBe('earlier');
    expect(sessionGroupKey('not-a-date', now)).toBe('earlier');
  });
});

describe('groupSessionsByRecency', () => {
  it('keeps order and drops empty groups', () => {
    const groups = groupSessionsByRecency(
      [
        session('a', '2026-09-02T10:00:00+08:00'),
        session('b', '2026-08-20T10:00:00+08:00'),
        session('c', '2026-09-02T09:00:00+08:00'),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.sessions.map((s) => s.id)])).toEqual([
      ['今天', ['a', 'c']],
      ['更早', ['b']],
    ]);
  });
});

describe('sessionDisplayTitle', () => {
  it('shows the first message for untitled sessions only', () => {
    expect(sessionDisplayTitle({ title: '新对话', preview: 'MU 怎么看' })).toBe('MU 怎么看');
    expect(sessionDisplayTitle({ title: '新对话', preview: null })).toBe('新对话');
    expect(sessionDisplayTitle({ title: 'NVDA', preview: 'MU 怎么看' })).toBe('NVDA');
  });
});

describe('isBlankSession', () => {
  it('is blank only with no messages and no running turn', () => {
    expect(isBlankSession({ messageCount: 0, busy: false })).toBe(true);
    expect(isBlankSession({ messageCount: 0, busy: true })).toBe(false);
    expect(isBlankSession({ messageCount: 2, busy: false })).toBe(false);
  });
});
