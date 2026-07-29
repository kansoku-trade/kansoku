// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerReviewPayload } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';

vi.mock('../charts/intraday/useIntradayCharts', () => ({
  EMA_COLORS: ['#fff'],
  useIntradayCharts: vi.fn(),
}));

vi.mock('../desktop/desktopWindowsBridge', () => ({
  getPopoutBridge: () => null,
}));

const { TrainerReview } = await import('./TrainerReview');

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

const REPLAY = [
  bar('2026-01-05T14:00:00.000Z', 100),
  bar('2026-01-05T14:05:00.000Z', 101),
  bar('2026-01-05T14:10:00.000Z', 102),
  bar('2026-01-05T14:15:00.000Z', 103),
];

function payload(overrides: Partial<TrainerReviewPayload> = {}): TrainerReviewPayload {
  return {
    sessionId: 'run-1',
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    provenance: {
      outputId: 'case-1',
      aliasSymbol: 'TRAIN01',
      sourceId: 'src-1',
      sourceSymbol: 'REALCANARY.US',
      sourceCutoff: '2019-04-01T20:00:00.000Z',
      syntheticCutoff: '2026-01-05T13:55:00.000Z',
      dayShift: 1064,
      priceScale: 0.1,
      volumeScale: 7,
    },
    tag: 'false-breakout',
    lookback: [bar('2026-01-05T13:55:00.000Z', 99)],
    replay: REPLAY,
    epilogue: [bar('2026-01-05T14:20:00.000Z', 106)],
    playedThrough: 2,
    trades: [],
    result: null,
    events: [
      {
        kind: 'coach',
        at: REPLAY[1].time,
        barIndex: 1,
        price: 101,
        label: '第 1 次问 AI',
        coachId: 'coach-1',
      },
    ],
    coach: [],
    facts: {
      stopAutopsy: {
        tradeId: 1,
        stop: 98,
        overshoot: 0.6,
        overshootPct: 0.6122,
        reachedTargetAfter: true,
      },
      holdToEpilogueEndR: 3,
      afterExitHighR: 4.5,
      afterExitLowR: -1,
    },
    lesson: null,
    ...overrides,
  };
}

function bridgeWith(overrides: Partial<Record<string, unknown>> = {}): TrainerBridge {
  return {
    review: vi.fn().mockResolvedValue({ ok: true, data: payload() }),
    annotate: vi.fn(),
    saveLesson: vi.fn(),
    syncLesson: vi.fn(),
    ...overrides,
  } as unknown as TrainerBridge;
}

afterEach(() => {
  cleanup();
});

describe('TrainerReview', () => {
  it('reveals the real identity and the structure tag once the episode is over', async () => {
    render(<TrainerReview bridge={bridgeWith()} sessionId="run-1" />);

    await waitFor(() => expect(screen.getByText('REALCANARY.US')).toBeTruthy());
    expect(screen.getByText('2019-04-01')).toBeTruthy();
    expect(screen.getByText('标签：假突破')).toBeTruthy();
  });

  it('shows the three numbers a live account cannot produce', async () => {
    render(<TrainerReview bridge={bridgeWith()} sessionId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('trainer-review-facts')).toBeTruthy());
    expect(screen.getByText(/占止损价 0\.61%，之后到过目标/)).toBeTruthy();
    expect(screen.getByText('仅供观察，不计成绩')).toBeTruthy();
  });

  it('parks the brush at the end and lets it be dragged back', async () => {
    render(<TrainerReview bridge={bridgeWith()} sessionId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('trainer-review-timeline')).toBeTruthy());
    const brush = screen.getByLabelText('重放到第几根') as HTMLInputElement;
    expect(brush.value).toBe('3');
    expect(brush.max).toBe('3');

    fireEvent.change(brush, { target: { value: '1' } });
    expect((screen.getByLabelText('重放到第几根') as HTMLInputElement).value).toBe('1');
  });

  // Splicing post-case bars onto a rewound chart would put them straight after a mid-case bar,
  // so the toggle is only live while the brush is parked at the end.
  it('locks the epilogue toggle while the chart is rewound', async () => {
    render(<TrainerReview bridge={bridgeWith()} sessionId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('trainer-review-timeline')).toBeTruthy());
    const toggle = screen.getByLabelText(/显示收盘后走势/) as HTMLInputElement;
    expect(toggle.disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('重放到第几根'), { target: { value: '1' } });

    expect((screen.getByLabelText(/显示收盘后走势/) as HTMLInputElement).disabled).toBe(true);
  });

  it('reports a refusal instead of rendering an empty page', async () => {
    const bridge = bridgeWith({
      review: vi
        .fn()
        .mockResolvedValue({ ok: false, error: '这一局还没结束', code: 'TRAINER_PROTOCOL', status: 400 }),
    });
    render(<TrainerReview bridge={bridge} sessionId="run-1" />);

    await waitFor(() => expect(screen.getByText('这一局还没结束')).toBeTruthy());
    expect(screen.queryByTestId('trainer-review')).toBeNull();
  });
});

describe('TrainerReview lesson gate', () => {
  it('keeps the sync button locked until the sentence has been stored', async () => {
    render(<TrainerReview bridge={bridgeWith()} sessionId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('trainer-review-lesson')).toBeTruthy());
    const sync = screen.getByRole('button', {
      name: '同步到 journal/lessons.md',
    }) as HTMLButtonElement;
    expect(sync.disabled).toBe(true);
  });

  it('unlocks the sync button once the same sentence is stored, and never syncs on its own', async () => {
    const saveLesson = vi.fn().mockResolvedValue({
      ok: true,
      data: { text: '止损放结构外', writtenAt: '2026-01-05T15:00:00.000Z', syncedAt: null },
    });
    const syncLesson = vi.fn();
    render(<TrainerReview bridge={bridgeWith({ saveLesson, syncLesson })} sessionId="run-1" />);

    await waitFor(() => expect(screen.getByTestId('trainer-review-lesson')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('本局教训'), { target: { value: '止损放结构外' } });
    fireEvent.click(screen.getByRole('button', { name: '存进训练区' }));

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '同步到 journal/lessons.md' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(saveLesson).toHaveBeenCalledWith({ sessionId: 'run-1', text: '止损放结构外' });
    expect(syncLesson).not.toHaveBeenCalled();
  });
});
