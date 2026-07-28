import { describe, expect, it } from 'vitest';
import type { TrainerStepEvent } from '@kansoku/pro-api';
import {
  describeStepEvent,
  describeStepEvents,
  PLAYBACK_SPEEDS,
  playbackIntervalMs,
} from './advanceStep';

function event(barOffset: number, event: TrainerStepEvent['event']): TrainerStepEvent {
  return { barOffset, cursor: barOffset, at: '2026-01-05T14:00:00.000Z', event };
}

describe('playbackIntervalMs', () => {
  it('halves the interval at 2x and shortens further up to 8x', () => {
    const at1x = playbackIntervalMs(1);
    expect(playbackIntervalMs(2)).toBe(at1x / 2);
    expect(playbackIntervalMs(4)).toBe(at1x / 4);
    expect(playbackIntervalMs(8)).toBe(at1x / 8);
  });

  it('lengthens the interval at 0.5x', () => {
    expect(playbackIntervalMs(0.5)).toBe(playbackIntervalMs(1) * 2);
  });

  it('covers every documented speed', () => {
    expect(PLAYBACK_SPEEDS).toEqual([0.5, 1, 2, 4, 8]);
  });
});

describe('describeStepEvent', () => {
  it('names the base period and the bar offset within the step', () => {
    expect(describeStepEvent(event(7, 'filled'), '5m')).toBe('第 7 根 5m 触发挂单成交');
    expect(describeStepEvent(event(11, 'stop_hit'), '5m')).toBe('第 11 根 5m 打到止损');
  });
});

describe('describeStepEvents', () => {
  it('joins the spec example into one ordered narrative', () => {
    const events = [event(7, 'filled'), event(11, 'stop_hit')];
    expect(describeStepEvents(events, '5m')).toBe('第 7 根 5m 触发挂单成交，第 11 根 5m 打到止损');
  });

  it('returns an empty string for no events', () => {
    expect(describeStepEvents([], '5m')).toBe('');
  });
});
