// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  TrainerClosedTrade,
  TrainerProvenance,
  TrainerResult,
  TrainerReveal,
  TrainerView,
} from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { TrainerSettlement } from './TrainerSettlement';

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

function closedTrade(overrides: Partial<TrainerClosedTrade> = {}): TrainerClosedTrade {
  return {
    tradeId: 1,
    direction: 'long',
    decisionBar: 0,
    decisionTime: '2026-01-05T14:00:00.000Z',
    entry: { time: '2026-01-05T14:00:00.000Z', price: 100 },
    exit: { time: '2026-01-05T15:00:00.000Z', price: 103 },
    exitReason: 'target',
    initialStop: 98,
    finalStop: 98,
    target: 106,
    initialRisk: 2,
    grossR: 1.5,
    frictionR: 0.1,
    netR: 1.4,
    mfeR: 2.2,
    maeR: 0,
    holdingBars: 5,
    ...overrides,
  };
}

function scaledTrade(overrides: Partial<TrainerClosedTrade> = {}): TrainerClosedTrade {
  return closedTrade({
    entry: { time: '2026-01-05T14:00:00.000Z', price: 98 },
    exit: { time: '2026-01-05T17:00:00.000Z', price: 104 },
    lots: [
      { time: '2026-01-05T14:00:00.000Z', price: 100, size: 0.5 },
      { time: '2026-01-05T15:00:00.000Z', price: 96, size: 0.5 },
    ],
    exits: [
      { time: '2026-01-05T16:00:00.000Z', price: 106, size: 0.5, reason: 'target' },
      { time: '2026-01-05T17:00:00.000Z', price: 102, size: 0.5, reason: 'stop' },
    ],
    initialStop: 98,
    initialRisk: 2,
    target: 106,
    exitReason: 'stop',
    ...overrides,
  });
}

function terminalResult(trades: TrainerClosedTrade[]): TrainerResult {
  return {
    terminationReason: 'horizon',
    direction: trades.at(-1)?.direction ?? 'neutral',
    entry: trades.at(0)?.entry ?? null,
    exit: trades.at(-1)?.exit ?? null,
    initialRisk: trades.at(0)?.initialRisk ?? null,
    grossR: trades.reduce((sum, t) => sum + t.grossR, 0),
    frictionR: trades.reduce((sum, t) => sum + t.frictionR, 0),
    netR: trades.reduce((sum, t) => sum + t.netR, 0),
    mfeR: trades.length ? Math.max(...trades.map((t) => t.mfeR)) : null,
    maeR: trades.length ? Math.max(...trades.map((t) => t.maeR)) : null,
    holdingBars: trades.reduce((sum, t) => sum + t.holdingBars, 0),
    steps: 10,
    trades,
    tradeCount: trades.length,
    winCount: trades.filter((t) => t.netR > 0).length,
    lossCount: trades.filter((t) => t.netR < 0).length,
  };
}

function makeView(overrides: Partial<TrainerView> = {}): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', 100), bar('2026-01-05T14:05:00.000Z', 103)];
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: base.length - 1,
    asOf: base.at(-1)!.time,
    bars: { base, mid: base, top: base },
    quote: {},
    phase: 'terminal',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 0,
    terminal: true,
    result: null,
    ...overrides,
  };
}

const PROVENANCE: TrainerProvenance = {
  outputId: 'case-1',
  aliasSymbol: 'TRAIN01',
  sourceId: 'src-1',
  sourceSymbol: 'REALCANARY.US',
  sourceCutoff: '2019-04-01T20:00:00.000Z',
  syntheticCutoff: '2026-01-05T14:05:00.000Z',
  dayShift: 1064,
  priceScale: 0.123456,
  volumeScale: 7.654321,
};

function makeBridge(reveal: ReturnType<typeof vi.fn>): TrainerBridge {
  return { reveal } as unknown as TrainerBridge;
}

afterEach(() => {
  cleanup();
});

describe('TrainerSettlement reveal gate', () => {
  it('never calls reveal for a non-terminal view', async () => {
    const reveal = vi.fn();
    render(
      <TrainerSettlement
        view={makeView({ phase: 'flat', terminal: false })}
        bridge={makeBridge(reveal)}
        sessionId="run-1"
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reveal).not.toHaveBeenCalled();
  });

  it('calls reveal once mounted on a terminal view and shows the real symbol/date', async () => {
    const reveal = vi.fn(async () => ({
      ok: true as const,
      data: { provenance: PROVENANCE, epilogue: [] } satisfies TrainerReveal,
    }));
    render(<TrainerSettlement view={makeView()} bridge={makeBridge(reveal)} sessionId="run-1" />);

    expect(reveal).toHaveBeenCalledWith({ sessionId: 'run-1' });
    await screen.findByText(/REALCANARY\.US/);
    expect(screen.getByText(/2019-04-01/)).toBeTruthy();
  });

  it('shows the failure message instead of an identity when reveal is refused', async () => {
    const reveal = vi.fn(async () => ({
      ok: false as const,
      error: 'training session has not finished',
      code: 'TRAINER_PROTOCOL' as const,
      status: 400,
    }));
    render(<TrainerSettlement view={makeView()} bridge={makeBridge(reveal)} sessionId="run-1" />);
    await screen.findByText(/has not finished/);
  });
});

describe('TrainerSettlement trade record', () => {
  it('shows net R, planned reward:risk, and the max-favorable-excursion giveback per trade', async () => {
    const trades = [closedTrade()];
    const reveal = vi.fn(async () => ({
      ok: true as const,
      data: { provenance: PROVENANCE, epilogue: [] } satisfies TrainerReveal,
    }));
    render(
      <TrainerSettlement
        view={makeView({ trades, result: terminalResult(trades) })}
        bridge={makeBridge(reveal)}
        sessionId="run-1"
      />,
    );

    const row = screen.getByTestId('trainer-settlement-trades').textContent;
    expect(row).toContain('3.00 : 1');
    expect(row).toContain('1.40');
    expect(row).toContain('0.80');

    const figures = screen.getByTestId('trainer-settlement-stats').textContent;
    expect(figures).toContain('计划盈亏比');
    expect(figures).toContain('实际拿到');
    expect(figures).toContain('最大浮盈回吐');
  });

  it('lists every fill of a scaled-in, scaled-out trade with its size and its own ending', async () => {
    const trades = [scaledTrade()];
    const reveal = vi.fn(async () => ({
      ok: true as const,
      data: { provenance: PROVENANCE, epilogue: [] } satisfies TrainerReveal,
    }));
    render(
      <TrainerSettlement
        view={makeView({ trades, result: terminalResult(trades) })}
        bridge={makeBridge(reveal)}
        sessionId="run-1"
      />,
    );

    const row = screen.getByTestId('trainer-settlement-trades').textContent!;
    expect(row).toContain('100.00建仓50%');
    expect(row).toContain('96.00加仓50%');
    expect(row).toContain('106.00止盈50%');
    expect(row).toContain('102.00止损50%');
    expect(row).not.toContain('98.00');
    expect(row).toContain('3.00 : 1');
  });

  // 98.881109 is the fill price the engine actually recorded; the settlement is a report, not a
  // raw dump, so it rounds for display while the trade data keeps every digit.
  it('rounds displayed prices to two decimals', async () => {
    const trades = [
      closedTrade({
        entry: { time: '2026-01-05T14:00:00.000Z', price: 98.881109 },
        exit: { time: '2026-01-05T14:00:00.000Z', price: 98.881109 },
        exitReason: 'stop',
      }),
    ];
    const reveal = vi.fn(async () => ({
      ok: true as const,
      data: { provenance: PROVENANCE, epilogue: [] } satisfies TrainerReveal,
    }));
    render(
      <TrainerSettlement
        view={makeView({ trades, result: terminalResult(trades) })}
        bridge={makeBridge(reveal)}
        sessionId="run-1"
      />,
    );

    const row = screen.getByTestId('trainer-settlement-trades').textContent!;
    expect(row).toContain('98.88');
    expect(row).not.toContain('98.881109');
  });
});

describe('TrainerSettlement review bar', () => {
  it('collapses to a single bar carrying the identity, the numbers and the way back', async () => {
    const trades = [closedTrade()];
    const onCollapse = vi.fn();
    const reveal = vi.fn(async () => ({
      ok: true as const,
      data: { provenance: PROVENANCE, epilogue: [] } satisfies TrainerReveal,
    }));
    render(
      <TrainerSettlement
        view={makeView({ trades, result: terminalResult(trades) })}
        bridge={makeBridge(reveal)}
        sessionId="run-1"
        expanded
        onCollapse={onCollapse}
      />,
    );

    await screen.findByText('REALCANARY.US');
    expect(screen.queryByTestId('trainer-settlement-stats')).toBeNull();
    expect(screen.queryByTestId('trainer-settlement-trades')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /收起/ }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});

describe('TrainerSettlement epilogue toggle', () => {
  const EPILOGUE_BARS: RawBar[] = [bar('2026-01-05T14:10:00.000Z', 9999)];

  it('defaults off and does not report epilogue bars until switched on', async () => {
    const trades = [closedTrade()];
    const reveal = vi.fn(async () => ({
      ok: true as const,
      data: { provenance: PROVENANCE, epilogue: EPILOGUE_BARS } satisfies TrainerReveal,
    }));
    const onEpilogueBarsChange = vi.fn();
    render(
      <TrainerSettlement
        view={makeView({ trades, result: terminalResult(trades) })}
        bridge={makeBridge(reveal)}
        sessionId="run-1"
        onEpilogueBarsChange={onEpilogueBarsChange}
      />,
    );

    await waitFor(() => expect(reveal).toHaveBeenCalled());
    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(onEpilogueBarsChange).toHaveBeenLastCalledWith(null);

    fireEvent.click(checkbox);
    await waitFor(() => expect(onEpilogueBarsChange).toHaveBeenLastCalledWith(EPILOGUE_BARS));
  });

  // This is the pinned invariant from spec §8: the epilogue exists to look at afterwards, never
  // to score with. A deliberately extreme epilogue price (9999) makes any accidental leak into a
  // displayed number obvious rather than a rounding-sized discrepancy.
  it('leaves every displayed statistic unchanged when the epilogue is revealed', async () => {
    const trades = [
      scaledTrade(),
      closedTrade({ tradeId: 2, direction: 'short', netR: -0.5, mfeR: 0.2, target: 94 }),
    ];
    const reveal = vi.fn(async () => ({
      ok: true as const,
      data: { provenance: PROVENANCE, epilogue: EPILOGUE_BARS } satisfies TrainerReveal,
    }));
    render(
      <TrainerSettlement
        view={makeView({ trades, result: terminalResult(trades) })}
        bridge={makeBridge(reveal)}
        sessionId="run-1"
        onEpilogueBarsChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(reveal).toHaveBeenCalled());
    const checkbox = await screen.findByRole('checkbox');
    const shown = () => [
      screen.getByTestId('trainer-settlement-stats').textContent,
      screen.getByTestId('trainer-settlement-trades').textContent,
    ];
    const before = shown();

    fireEvent.click(checkbox);
    await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(true));

    expect(shown()).toEqual(before);

    fireEvent.click(checkbox);
    await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(false));
    expect(shown()).toEqual(before);
  });

  it('keeps the toggle disabled until reveal resolves', () => {
    const reveal = vi.fn(() => new Promise<never>(() => {}));
    render(<TrainerSettlement view={makeView()} bridge={makeBridge(reveal)} sessionId="run-1" />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });
});
