// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  TrainerDirection,
  TrainerPosition,
  TrainerSubmission,
  TrainerView,
} from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { TrainerOrderPanel } from './TrainerOrderPanel';

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

function makePosition(
  direction: TrainerDirection,
  overrides: Partial<TrainerPosition> = {},
): TrainerPosition {
  return {
    tradeId: 1,
    direction,
    decisionBar: 0,
    decisionTime: '2026-01-05T14:00:00.000Z',
    entryPrice: 100,
    entryTime: '2026-01-05T14:00:00.000Z',
    initialStop: direction === 'long' ? 99 : 101,
    initialRisk: 1,
    stop: direction === 'long' ? 99 : 101,
    target: direction === 'long' ? 103 : 97,
    holdingBars: 5,
    mfeR: 1.5,
    maeR: 0,
    entryReason: { category: 'breakout', summary: '' },
    ...overrides,
  };
}

function makeOpenView(direction: TrainerDirection, referenceClose: number): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', referenceClose)];
  return makeView({
    phase: 'open',
    position: makePosition(direction),
    bars: { base, mid: base, top: base },
  });
}

// Linear price/pixel map (y = 300 - price) so the drag math is checkable by hand:
// default draft off a $100 close is stop=99 (y=201) / target1=102 (y=198).
function makeHandle() {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0 }) as DOMRect;
  const series = {
    attachPrimitive: vi.fn(),
    priceToCoordinate: (price: number) => 300 - price,
    coordinateToPrice: (y: number) => 300 - y,
  };
  const handle = { chart: {}, series, container } as unknown as DrawingChartHandle;
  return { handle, container };
}

function makeBridge(): { bridge: TrainerBridge; submit: ReturnType<typeof vi.fn> } {
  const submit = vi.fn(async () => ({
    ok: true as const,
    data: { view: makeView(), events: [], advancedBars: 0, terminal: false, result: null },
  }));
  const bridge = { submit } as unknown as TrainerBridge;
  return { bridge, submit };
}

function makeAmendBridge(nextView: TrainerView): {
  bridge: TrainerBridge;
  amend: ReturnType<typeof vi.fn>;
} {
  const amend = vi.fn(async () => ({
    ok: true as const,
    data: { view: nextView, events: [], advancedBars: 0, terminal: false, result: null },
  }));
  const bridge = { amend } as unknown as TrainerBridge;
  return { bridge, amend };
}

afterEach(() => {
  cleanup();
});

describe('TrainerOrderPanel drag', () => {
  it('dragging the stop edge updates the stop input', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.pointerDown(container, { clientY: 201 });
    fireEvent.pointerMove(window, { clientY: 220 });
    fireEvent.pointerUp(window);

    const stopInput = screen.getByLabelText('止损') as HTMLInputElement;
    expect(Number(stopInput.value)).toBe(80);
  });

  it('dragging the target edge updates the target input', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.pointerDown(container, { clientY: 198 });
    fireEvent.pointerMove(window, { clientY: 150 });
    fireEvent.pointerUp(window);

    const targetInput = screen.getByLabelText('目标') as HTMLInputElement;
    expect(Number(targetInput.value)).toBe(150);
  });

  it('ignores a pointerdown that lands far from both edges', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.pointerDown(container, { clientY: 50 });
    fireEvent.pointerMove(window, { clientY: 260 });
    fireEvent.pointerUp(window);

    const stopInput = screen.getByLabelText('止损') as HTMLInputElement;
    const targetInput = screen.getByLabelText('目标') as HTMLInputElement;
    expect(Number(stopInput.value)).toBe(99);
    expect(Number(targetInput.value)).toBe(102);
  });

  it('updates the reward:risk readout as the drag moves the target', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.pointerDown(container, { clientY: 198 });
    fireEvent.pointerMove(window, { clientY: 199 });
    fireEvent.pointerUp(window);

    expect(screen.getByText(/盈亏比/).textContent).toContain('1.00 : 1');
  });

  it('numeric input edits stay in sync with dragged state (two-way sync)', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.pointerDown(container, { clientY: 201 });
    fireEvent.pointerMove(window, { clientY: 210 });
    fireEvent.pointerUp(window);
    const stopInput = screen.getByLabelText('止损') as HTMLInputElement;
    expect(Number(stopInput.value)).toBe(90);

    fireEvent.change(stopInput, { target: { value: '95' } });
    expect(Number(stopInput.value)).toBe(95);
  });
});

describe('TrainerOrderPanel submit', () => {
  it('submits a limit order whose entry_plan matches the dragged prices', async () => {
    const { handle, container } = makeHandle();
    const { bridge, submit } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.pointerDown(container, { clientY: 201 });
    fireEvent.pointerMove(window, { clientY: 210 });
    fireEvent.pointerUp(window);
    fireEvent.pointerDown(container, { clientY: 198 });
    fireEvent.pointerMove(window, { clientY: 150 });
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole('button', { name: '提交限价单' }));

    expect(submit).toHaveBeenCalledTimes(1);
    const call = submit.mock.calls[0][0] as {
      sessionId: string;
      submission: TrainerSubmission;
      entryMode: string;
    };
    expect(call.sessionId).toBe('run-1');
    expect(call.entryMode).toBe('limit');
    expect(call.submission.entry_plan).toEqual({ entry: 100, stop: 90, target1: 150 });
  });

  it('the market button submits entryMode market with the live price as entry', async () => {
    const { handle, container } = makeHandle();
    const { bridge, submit } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.pointerDown(container, { clientY: 201 });
    fireEvent.pointerMove(window, { clientY: 210 });
    fireEvent.pointerUp(window);
    // Also widen the target so the resulting draft still clears the TD-RR-01 floor — the default
    // target1=102 against a stop dragged to 90 would be a 0.2:1 ratio and lock the button.
    fireEvent.pointerDown(container, { clientY: 198 });
    fireEvent.pointerMove(window, { clientY: 178 });
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole('button', { name: '照现价立刻进' }));

    expect(submit).toHaveBeenCalledTimes(1);
    const call = submit.mock.calls[0][0] as {
      submission: TrainerSubmission;
      entryMode: string;
    };
    expect(call.entryMode).toBe('market');
    expect(call.submission.entry_plan?.entry).toBe(100);
    expect(call.submission.entry_plan?.stop).toBe(90);
  });

  it('applies the returned view once the submit resolves', async () => {
    const { handle } = makeHandle();
    const nextView = makeView({ phase: 'pending' });
    const submit = vi.fn(async () => ({
      ok: true as const,
      data: { view: nextView, events: [], advancedBars: 0, terminal: false, result: null },
    }));
    const bridge = { submit } as unknown as TrainerBridge;
    const onViewChange = vi.fn();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={onViewChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '提交限价单' }));
    await waitFor(() => expect(onViewChange).toHaveBeenCalledWith(nextView));
  });
});

describe('TrainerOrderPanel non-flat phase', () => {
  it('renders a status line instead of the entry form once an order exists', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    const view = makeView({
      phase: 'pending',
      order: {
        tradeId: 1,
        direction: 'long',
        decisionBar: 0,
        decisionTime: '2026-01-05T14:05:00.000Z',
        entry: 101,
        initialStop: 99,
        stop: 99,
        target: 108,
        waitedBars: 0,
        entryReason: { category: 'breakout', summary: '' },
        entryMode: 'limit',
      },
    });
    render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    expect(screen.queryByLabelText('止损')).toBeNull();
    expect(screen.getByText(/挂单中/)).toBeTruthy();
  });
});

describe('TrainerOrderPanel TD-RR-01 gate', () => {
  it('locks the submit buttons and warns the target field just below the 1.5:1 floor', () => {
    const { handle } = makeHandle();
    const { bridge, submit } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('目标'), { target: { value: '101.499' } });

    const limitButton = screen.getByRole('button', { name: '提交限价单' }) as HTMLButtonElement;
    const marketButton = screen.getByRole('button', { name: '照现价立刻进' }) as HTMLButtonElement;
    expect(limitButton.disabled).toBe(true);
    expect(marketButton.disabled).toBe(true);
    expect(
      screen
        .getByLabelText('目标')
        .closest('label')
        ?.classList.contains('trainer-order-field--warn'),
    ).toBe(true);

    fireEvent.click(limitButton);
    expect(submit).not.toHaveBeenCalled();
  });

  it('unlocks exactly at the 1.5:1 floor', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('目标'), { target: { value: '101.5' } });

    const limitButton = screen.getByRole('button', { name: '提交限价单' }) as HTMLButtonElement;
    const marketButton = screen.getByRole('button', { name: '照现价立刻进' }) as HTMLButtonElement;
    expect(limitButton.disabled).toBe(false);
    expect(marketButton.disabled).toBe(false);
    expect(
      screen
        .getByLabelText('目标')
        .closest('label')
        ?.classList.contains('trainer-order-field--warn'),
    ).toBe(false);
  });
});

describe('TrainerOrderPanel TD-EXIT-01 gate (position amend)', () => {
  it('long: allows tightening the stop to breakeven and above, rejects widening back into loss', () => {
    const { handle } = makeHandle();
    const { bridge } = makeAmendBridge(makeOpenView('long', 102));
    const view = makeOpenView('long', 102); // entry 100 / stop 99 / reference 102 (past 1R)
    render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );
    const stopInput = screen.getByLabelText('止损') as HTMLInputElement;

    fireEvent.change(stopInput, { target: { value: '100' } });
    expect(Number(stopInput.value)).toBe(100);

    fireEvent.change(stopInput, { target: { value: '100.5' } });
    expect(Number(stopInput.value)).toBe(100.5);

    fireEvent.change(stopInput, { target: { value: '97' } });
    expect(Number(stopInput.value)).toBe(99); // clamped back to the committed stop, not to 97
  });

  it('short: allows tightening the stop to breakeven and above, rejects widening back into loss', () => {
    const { handle } = makeHandle();
    const { bridge } = makeAmendBridge(makeOpenView('short', 98));
    const view = makeOpenView('short', 98); // entry 100 / stop 101 / reference 98 (past 1R)
    render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );
    const stopInput = screen.getByLabelText('止损') as HTMLInputElement;

    fireEvent.change(stopInput, { target: { value: '100' } });
    expect(Number(stopInput.value)).toBe(100);

    fireEvent.change(stopInput, { target: { value: '99.5' } });
    expect(Number(stopInput.value)).toBe(99.5);

    fireEvent.change(stopInput, { target: { value: '102' } });
    expect(Number(stopInput.value)).toBe(101); // clamped back to the committed stop, not to 102
  });

  it('locks the confirm button until a reason is entered', () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge } = makeAmendBridge(view);
    render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('止损'), { target: { value: '100.5' } });
    const confirmButton = screen.getByRole('button', { name: '确认调整' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('调整原因'), {
      target: { value: '止损上移到 100.5 锁利' },
    });
    expect(confirmButton.disabled).toBe(false);
  });

  it('submits the amended stop/target with the entered reason and applies the returned view', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const nextView = makeOpenView('long', 102);
    const { bridge, amend } = makeAmendBridge(nextView);
    const onViewChange = vi.fn();
    render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={onViewChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('止损'), { target: { value: '100.5' } });
    fireEvent.change(screen.getByLabelText('调整原因'), {
      target: { value: '止损上移到 100.5 锁利' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认调整' }));

    await waitFor(() => expect(amend).toHaveBeenCalledTimes(1));
    expect(amend).toHaveBeenCalledWith({
      sessionId: 'run-1',
      stop: 100.5,
      target: 103,
      reason: { category: 'risk_management', summary: '止损上移到 100.5 锁利' },
    });
    await waitFor(() => expect(onViewChange).toHaveBeenCalledWith(nextView));
  });
});
