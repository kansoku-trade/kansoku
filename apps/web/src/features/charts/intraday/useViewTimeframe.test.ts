// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntradayTfData } from '@kansoku/shared/types';

const viewTimeframe = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: { charts: { viewTimeframe: (input: unknown) => viewTimeframe(input) } },
}));

const { useViewTimeframe } = await import('./useViewTimeframe');
const { applyLiveQuote } = await import('./useLiveBuilt');

const tfOf = (close: number, high = close, low = close): IntradayTfData =>
  ({
    candles: [
      { time: 1, open: 1, high: 2, low: 0.5, close: 1 },
      { time: 2, open: close, high, low, close },
    ],
  }) as unknown as IntradayTfData;

beforeEach(() => {
  viewTimeframe.mockReset();
  viewTimeframe.mockResolvedValue({ period: 'day', bars: 2, tf: tfOf(100) });
});

afterEach(() => vi.useRealTimers());

describe('applyLiveQuote', () => {
  it('moves the last bar close to the live price and stretches high/low around it', () => {
    expect(applyLiveQuote(tfOf(100, 101, 99), 103).candles.at(-1)).toMatchObject({
      close: 103,
      high: 103,
      low: 99,
    });
    expect(applyLiveQuote(tfOf(100, 101, 99), 98).candles.at(-1)).toMatchObject({
      close: 98,
      high: 101,
      low: 98,
    });
  });

  it('leaves the data alone for a missing, zero or unchanged price', () => {
    const tf = tfOf(100, 101, 99);

    expect(applyLiveQuote(tf, null)).toBe(tf);
    expect(applyLiveQuote(tf, 0)).toBe(tf);
    expect(applyLiveQuote(tf, 100)).toBe(tf);
  });
});

describe('useViewTimeframe', () => {
  it('does not fetch for analysis timeframes', () => {
    const { result } = renderHook(() => useViewTimeframe('NVDA.US', 'm15'));

    expect(viewTimeframe).not.toHaveBeenCalled();
    expect(result.current.tf).toBeNull();
  });

  it('fetches a view period', async () => {
    const { result } = renderHook(() => useViewTimeframe('NVDA.US', 'day', { live: true }));

    await waitFor(() => expect(result.current.tf).toBeTruthy());
    expect(viewTimeframe).toHaveBeenCalledWith({ symbol: 'NVDA.US', period: 'day' });
    expect(result.current.tf?.candles.at(-1)?.close).toBe(100);
  });

  it('passes as_of through so a frozen chart stays frozen', async () => {
    const { result } = renderHook(() =>
      useViewTimeframe('NVDA.US', 'week', { asOf: '2026-07-20T20:00:00.000Z' }),
    );

    await waitFor(() => expect(result.current.tf).toBeTruthy());
    expect(viewTimeframe).toHaveBeenCalledWith({
      symbol: 'NVDA.US',
      period: 'week',
      as_of: '2026-07-20T20:00:00.000Z',
    });
    expect(result.current.tf?.candles.at(-1)?.close).toBe(100);
  });

  it('surfaces the server message when the period cannot be loaded', async () => {
    viewTimeframe.mockRejectedValue(new Error('only 0 1m bars exist at or before …'));

    const { result } = renderHook(() => useViewTimeframe('NVDA.US', '1m'));

    await waitFor(() => expect(result.current.error).toMatch(/only 0 1m bars/));
    expect(result.current.tf).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('refetches on a timer while live, and stops once unmounted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, unmount } = renderHook(() =>
      useViewTimeframe('NVDA.US', 'day', { live: true }),
    );

    await waitFor(() => expect(result.current.tf).toBeTruthy());
    expect(viewTimeframe).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(viewTimeframe).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(viewTimeframe).toHaveBeenCalledTimes(2);
  });

  it('does not poll a frozen historical chart', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useViewTimeframe('NVDA.US', 'day', { live: false }));

    await waitFor(() => expect(result.current.tf).toBeTruthy());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(viewTimeframe).toHaveBeenCalledTimes(1);
  });
});
