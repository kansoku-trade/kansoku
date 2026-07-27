// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerPosition, TrainerStepResult, TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { NO_REASON_GIVEN } from './orderDraft';
import { TrainerAdvanceControls } from './TrainerAdvanceControls';

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

function makeView(overrides: Partial<TrainerView> = {}): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', 100), bar('2026-01-05T14:05:00.000Z', 100)];
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: base.length - 1,
    asOf: base.at(-1)!.time,
    bars: { base, mid: base, top: base },
    quote: {},
    phase: 'flat',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 10,
    terminal: false,
    result: null,
    ...overrides,
  };
}

function makePosition(overrides: Partial<TrainerPosition> = {}): TrainerPosition {
  return {
    tradeId: 1,
    direction: 'long',
    decisionBar: 0,
    decisionTime: '2026-01-05T14:00:00.000Z',
    lots: [{ time: '2026-01-05T14:00:00.000Z', price: 100, size: 1, remaining: 1 }],
    exits: [],
    entryPrice: 100,
    entryTime: '2026-01-05T14:00:00.000Z',
    initialStop: 99,
    riskUnit: 1,
    realizedR: 0,
    realizedFrictionR: 0,
    stop: 99,
    target: 103,
    holdingBars: 1,
    mfeR: 0,
    maeR: 0,
    entryReason: { category: 'breakout', summary: '' },
    ...overrides,
  };
}

function stepResult(overrides: Partial<TrainerStepResult> = {}): TrainerStepResult {
  return {
    view: makeView(),
    events: [],
    advancedBars: 1,
    terminal: false,
    result: null,
    ...overrides,
  };
}

function makeBridge(step: ReturnType<typeof vi.fn>): TrainerBridge {
  return { step } as unknown as TrainerBridge;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TrainerAdvanceControls single step', () => {
  it('steps one bar of the active period with no reason while flat', async () => {
    const step = vi.fn(async () => ({ ok: true as const, data: stepResult() }));
    const onViewChange = vi.fn();
    render(
      <TrainerAdvanceControls
        view={makeView()}
        period="15m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={onViewChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /步进/ }));

    await waitFor(() => expect(step).toHaveBeenCalledTimes(1));
    expect(step).toHaveBeenCalledWith({
      sessionId: 'run-1',
      action: { type: 'hold', bars: 1, period: '15m' },
    });
    await waitFor(() => expect(onViewChange).toHaveBeenCalled());
  });

  it('adopts the returned view from a completed step', async () => {
    const nextView = makeView({ cursor: 5 });
    const step = vi.fn(async () => ({ ok: true as const, data: stepResult({ view: nextView }) }));
    const onViewChange = vi.fn();
    render(
      <TrainerAdvanceControls
        view={makeView()}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={onViewChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /步进/ }));
    await waitFor(() => expect(onViewChange).toHaveBeenCalledWith(nextView));
  });
});

describe('TrainerAdvanceControls hold reason', () => {
  // The engine refuses a hold with no reason while pending/open, so the field is optional but the
  // wire value is not: an untyped field records that none was given rather than inventing one.
  it('steps with an empty reason field, sending the not-given marker', async () => {
    const step = vi.fn(async () => ({ ok: true as const, data: stepResult() }));
    const view = makeView({ phase: 'open', position: makePosition() });
    render(
      <TrainerAdvanceControls
        view={view}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    const stepButton = screen.getByRole('button', { name: /步进/ }) as HTMLButtonElement;
    const playButton = screen.getByRole('button', { name: '播放' }) as HTMLButtonElement;
    expect((screen.getByLabelText('继续持有理由') as HTMLInputElement).value).toBe('');
    expect(stepButton.disabled).toBe(false);
    expect(playButton.disabled).toBe(false);

    fireEvent.click(stepButton);

    await waitFor(() => expect(step).toHaveBeenCalledTimes(1));
    expect(step).toHaveBeenCalledWith({
      sessionId: 'run-1',
      action: {
        type: 'hold',
        bars: 1,
        period: '5m',
        reason: { category: 'other', summary: NO_REASON_GIVEN },
      },
    });
  });

  // An empty field sends the same marker every bar by design; flagging that as "reused words"
  // would put a reuse warning on a trader who never wrote anything to reuse.
  it('does not flag the reuse marker when the field is empty', async () => {
    const view = makeView({ phase: 'open', position: makePosition() });
    const step = vi.fn(async () => ({ ok: true as const, data: stepResult({ view }) }));
    render(
      <TrainerAdvanceControls
        view={view}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /步进/ }));
    await waitFor(() => expect(step).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('沿用上一次理由')).toBeNull();
  });

  it('sends the entered reason on a hold while a position is open', async () => {
    const step = vi.fn(async () => ({ ok: true as const, data: stepResult() }));
    const view = makeView({ phase: 'open', position: makePosition() });
    render(
      <TrainerAdvanceControls
        view={view}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('继续持有理由'), {
      target: { value: '价格仍在均线上方，继续持有' },
    });
    fireEvent.click(screen.getByRole('button', { name: /步进/ }));

    await waitFor(() => expect(step).toHaveBeenCalledTimes(1));
    expect(step).toHaveBeenCalledWith({
      sessionId: 'run-1',
      action: {
        type: 'hold',
        bars: 1,
        period: '5m',
        reason: { category: 'time_horizon', summary: '价格仍在均线上方，继续持有' },
      },
    });
  });
});

describe('TrainerAdvanceControls reuse marker', () => {
  it('shows the marker once a reason has been sent and the field still matches it', async () => {
    const view = makeView({ phase: 'open', position: makePosition() });
    const step = vi.fn(async () => ({
      ok: true as const,
      data: stepResult({ view }),
    }));
    render(
      <TrainerAdvanceControls
        view={view}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('继续持有理由'), {
      target: { value: '价格仍在均线上方，继续持有' },
    });
    expect(screen.queryByText('沿用上一次理由')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /步进/ }));
    await waitFor(() => expect(step).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('沿用上一次理由')).toBeTruthy());
  });

  it('hides the marker the instant the reason text is edited away from what was sent', async () => {
    const view = makeView({ phase: 'open', position: makePosition() });
    const step = vi.fn(async () => ({ ok: true as const, data: stepResult({ view }) }));
    render(
      <TrainerAdvanceControls
        view={view}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('继续持有理由'), {
      target: { value: '价格仍在均线上方，继续持有' },
    });
    fireEvent.click(screen.getByRole('button', { name: /步进/ }));
    await waitFor(() => expect(screen.getByText('沿用上一次理由')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('继续持有理由'), {
      target: { value: '跌破均线了，改主意' },
    });
    expect(screen.queryByText('沿用上一次理由')).toBeNull();
  });

  it('clears the reuse marker and the reason field once the position changes', async () => {
    const openView = makeView({ phase: 'open', position: makePosition({ tradeId: 1 }) });
    const step = vi.fn(async () => ({ ok: true as const, data: stepResult({ view: openView }) }));
    const { rerender } = render(
      <TrainerAdvanceControls
        view={openView}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('继续持有理由'), {
      target: { value: '价格仍在均线上方，继续持有' },
    });
    fireEvent.click(screen.getByRole('button', { name: /步进/ }));
    await waitFor(() => expect(screen.getByText('沿用上一次理由')).toBeTruthy());

    const nextTradeView = makeView({ phase: 'open', position: makePosition({ tradeId: 2 }) });
    rerender(
      <TrainerAdvanceControls
        view={nextTradeView}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    expect(screen.queryByText('沿用上一次理由')).toBeNull();
    expect((screen.getByLabelText('继续持有理由') as HTMLInputElement).value).toBe('');
  });
});

describe('TrainerAdvanceControls failure handling', () => {
  it('adopts the failure envelope view instead of assuming the session did not move (M-2)', async () => {
    const actualView = makeView({ cursor: 3 });
    const step = vi.fn(async () => ({
      ok: false as const,
      error: 'hold in open phase requires a reason',
      code: 'TRAINER_PROTOCOL' as const,
      status: 400,
      view: actualView,
    }));
    const onViewChange = vi.fn();
    render(
      <TrainerAdvanceControls
        view={makeView()}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={onViewChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /步进/ }));
    await waitFor(() => expect(onViewChange).toHaveBeenCalledWith(actualView));
    expect(screen.getByText('hold in open phase requires a reason')).toBeTruthy();
  });
});

describe('TrainerAdvanceControls playback', () => {
  it('pauses automatically once a step reports a non-empty events list (protection 1)', async () => {
    vi.useFakeTimers();
    const step = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: stepResult({
          events: [{ barOffset: 1, cursor: 1, at: '2026-01-05T14:05:00.000Z', event: 'filled' }],
        }),
      })
      .mockResolvedValue({ ok: true, data: stepResult() });
    render(
      <TrainerAdvanceControls
        view={makeView()}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
    expect(step).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '播放' })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('keeps playing through a boring tick, then stops once the episode reaches terminal', async () => {
    vi.useFakeTimers();
    const step = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: stepResult() })
      .mockResolvedValueOnce({
        ok: true,
        data: stepResult({ terminal: true, view: makeView({ terminal: true }) }),
      });
    render(
      <TrainerAdvanceControls
        view={makeView()}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
    expect(step).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
    expect(step).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('lists the intra-step events in order after a coarse-period step (protection 2)', async () => {
    const step = vi.fn(async () => ({
      ok: true as const,
      data: stepResult({
        events: [
          { barOffset: 7, cursor: 7, at: '2026-01-05T14:35:00.000Z', event: 'filled' },
          { barOffset: 11, cursor: 11, at: '2026-01-05T14:55:00.000Z', event: 'stop_hit' },
        ],
      }),
    }));
    render(
      <TrainerAdvanceControls
        view={makeView()}
        period="1h"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /步进/ }));
    await waitFor(() =>
      expect(screen.getByText('第 7 根 5m 触发挂单成交，第 11 根 5m 打到止损')).toBeTruthy(),
    );
  });
});

describe('TrainerAdvanceControls terminal guard', () => {
  it('disables step and play once the episode has ended', () => {
    const step = vi.fn();
    render(
      <TrainerAdvanceControls
        view={makeView({ terminal: true })}
        period="5m"
        bridge={makeBridge(step)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    expect((screen.getByRole('button', { name: /步进/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '播放' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
