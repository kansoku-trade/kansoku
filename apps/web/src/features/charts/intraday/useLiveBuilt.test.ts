// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';
import type { ChannelSpec } from '@web/lib/ws/wsHub';

const subscribeChannel = vi.fn();

vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const { useLiveBuilt } = await import('./useLiveBuilt');
const { tfDataOf } = await import('./timeframes');

const built = {
  defaultTf: 'm15',
  timeframes: {
    m15: { candles: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1 }] },
    day: { candles: [{ time: 1, open: 100, high: 101, low: 99, close: 100 }] },
  },
} as unknown as IntradayBuilt;

let subs: { spec: ChannelSpec; onPayload: (payload: unknown) => void }[];

beforeEach(() => {
  subs = [];
  subscribeChannel.mockReset();
  subscribeChannel.mockImplementation(
    (spec: ChannelSpec, onPayload: (payload: unknown) => void) => {
      subs.push({ spec, onPayload });
      return vi.fn();
    },
  );
});

function push(last: number) {
  act(() => {
    subs[0].onPayload({
      type: 'data',
      data: { quotes: [{ symbol: 'NVDA.US', last, pct: 0, session: '日盘', asOf: '' }] },
    });
  });
}

describe('useLiveBuilt', () => {
  it('patches the active view period with the live last price', () => {
    const { result } = renderHook(() => useLiveBuilt(built, 'day', 'NVDA.US', true));
    expect(result.current).toBe(built);

    push(103);

    expect(tfDataOf(result.current, 'day')?.candles.at(-1)).toMatchObject({
      close: 103,
      high: 103,
    });
    expect(result.current.timeframes.m15).toBe(built.timeframes.m15);
  });

  it('leaves analysis timeframes untouched', () => {
    const { result } = renderHook(() => useLiveBuilt(built, 'm15', 'NVDA.US', true));
    push(103);
    expect(result.current).toBe(built);
  });

  it('does not subscribe when not live', () => {
    const { result } = renderHook(() => useLiveBuilt(built, 'day', 'NVDA.US', false));
    expect(subscribeChannel).not.toHaveBeenCalled();
    expect(result.current).toBe(built);
  });
});
