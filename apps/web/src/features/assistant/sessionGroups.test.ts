import { describe, expect, it } from 'vitest';
import type { AssistantSessionMeta } from '@kansoku/core/contract/index';
import {
  groupSessionsByRecency,
  isBlankSession,
  sessionDisplayTitle,
  sessionGroupKey,
} from './sessionGroups';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-02T10:30:00.000Z');

function isoFromLocalMidnight(date: Date, offsetMs: number): string {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return new Date(start.getTime() + offsetMs).toISOString();
}

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
    expect(sessionGroupKey(isoFromLocalMidnight(now, 30 * 60 * 1000), now)).toBe('today');
    expect(sessionGroupKey(isoFromLocalMidnight(now, -30 * 60 * 1000), now)).toBe('yesterday');
    expect(sessionGroupKey(isoFromLocalMidnight(now, -5 * DAY_MS), now)).toBe('week');
    expect(sessionGroupKey(isoFromLocalMidnight(now, -13 * DAY_MS), now)).toBe('earlier');
    expect(sessionGroupKey('not-a-date', now)).toBe('earlier');
  });
});

describe('groupSessionsByRecency', () => {
  it('keeps order and drops empty groups', () => {
    const groups = groupSessionsByRecency(
      [
        session('a', isoFromLocalMidnight(now, 10 * 60 * 60 * 1000)),
        session('b', isoFromLocalMidnight(now, -13 * DAY_MS)),
        session('c', isoFromLocalMidnight(now, 9 * 60 * 60 * 1000)),
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
