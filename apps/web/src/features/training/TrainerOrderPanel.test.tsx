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
import type { PositionBoxPrimitive } from '../charts/intraday/positionBoxPrimitive';
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
    lots: [{ time: '2026-01-05T14:00:00.000Z', price: 100, size: 1, remaining: 1 }],
    exits: [],
    entryPrice: 100,
    entryTime: '2026-01-05T14:00:00.000Z',
    initialStop: direction === 'long' ? 99 : 101,
    riskUnit: 1,
    realizedR: 0,
    realizedFrictionR: 0,
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
    detachPrimitive: vi.fn(),
    priceToCoordinate: (price: number) => 300 - price,
    coordinateToPrice: (y: number) => 300 - y,
  };
  const handle = { chart: {}, series, container } as unknown as DrawingChartHandle;
  return { handle, container, series };
}

function makeBridge(): { bridge: TrainerBridge; submit: ReturnType<typeof vi.fn> } {
  const submit = vi.fn(async () => ({
    ok: true as const,
    data: { view: makeView(), events: [], advancedBars: 0, terminal: false, result: null },
  }));
  const bridge = { submit } as unknown as TrainerBridge;
  return { bridge, submit };
}

// The engine is the authority on what an amendment may do; this stub only stands in for its
// answer so the panel's plumbing can be tested. Engine agreement itself is pinned in
// packages/bench and in apps/pro's trainer.validateAmend suite.
type AmendVerdictStub = (input: { stop?: number; target?: number }) => {
  allowed: boolean;
  code: 'TRAINER_GUARDRAIL' | null;
  error: string | null;
};

const ALWAYS_ALLOWED: AmendVerdictStub = () => ({ allowed: true, code: null, error: null });

function makeAmendBridge(
  nextView: TrainerView,
  verdict: AmendVerdictStub = ALWAYS_ALLOWED,
): {
  bridge: TrainerBridge;
  amend: ReturnType<typeof vi.fn>;
  validateAmend: ReturnType<typeof vi.fn>;
} {
  const amend = vi.fn(async () => ({
    ok: true as const,
    data: { view: nextView, events: [], advancedBars: 0, terminal: false, result: null },
  }));
  const validateAmend = vi.fn(async (input: { stop?: number; target?: number }) => ({
    ok: true as const,
    data: verdict(input),
  }));
  const bridge = { amend, validateAmend } as unknown as TrainerBridge;
  return { bridge, amend, validateAmend };
}

// What the engine does to a long at entry 100 once mfeR >= 1: a stop below breakeven is refused
// even though it tightens.
const REFUSE_BELOW: AmendVerdictStub = ({ stop }) =>
  stop !== undefined && stop < 100
    ? {
        allowed: false,
        code: 'TRAINER_GUARDRAIL',
        error: 'amended long stop stays below the 100 entry while the position has already run',
      }
    : { allowed: true, code: null, error: null };

const REFUSE_ABOVE: AmendVerdictStub = ({ stop }) =>
  stop !== undefined && stop > 100
    ? {
        allowed: false,
        code: 'TRAINER_GUARDRAIL',
        error: 'amended short stop stays above the 100 entry while the position has already run',
      }
    : { allowed: true, code: null, error: null };

function makeCancelBridge(nextView: TrainerView): {
  bridge: TrainerBridge;
  cancel: ReturnType<typeof vi.fn>;
} {
  const cancel = vi.fn(async () => ({
    ok: true as const,
    data: { view: nextView, events: [], advancedBars: 0, terminal: false, result: null },
  }));
  const bridge = { cancel } as unknown as TrainerBridge;
  return { bridge, cancel };
}

function makeExitBridge(nextView: TrainerView): {
  bridge: TrainerBridge;
  exitNextOpen: ReturnType<typeof vi.fn>;
} {
  const exitNextOpen = vi.fn(async () => ({
    ok: true as const,
    data: { view: nextView, events: [], advancedBars: 0, terminal: false, result: null },
  }));
  const bridge = { exitNextOpen } as unknown as TrainerBridge;
  return { bridge, exitNextOpen };
}

function makePendingView(): TrainerView {
  return makeView({
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
    fireEvent.change(screen.getByLabelText('入场理由'), {
      target: { value: '5 分钟突破前高，放量确认' },
    });

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
    expect(call.submission.decision_reason).toEqual({
      category: 'other',
      summary: '5 分钟突破前高，放量确认',
    });
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
    fireEvent.change(screen.getByLabelText('入场理由'), { target: { value: '照现价追多' } });

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

    fireEvent.change(screen.getByLabelText('入场理由'), { target: { value: '突破前高' } });
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
    // The readout must round down, not to nearest — it must never display "1.50" (which would
    // read as clearing the floor) while the buttons above are disabled for missing it.
    expect(screen.getByText(/盈亏比/).textContent).toContain('1.49 : 1');

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
    fireEvent.change(screen.getByLabelText('入场理由'), { target: { value: '突破前高' } });

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
    expect(screen.getByText(/盈亏比/).textContent).toContain('1.50 : 1');
  });
});

describe('TrainerOrderPanel TD-EXIT-01 gate (position amend)', () => {
  it('long: unlocks confirm at breakeven and above, and blocks on the engine refusal below it', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102); // entry 100 / stop 99 / reference 102 (past 1R)
    const { bridge, amend } = makeAmendBridge(makeOpenView('long', 102), REFUSE_BELOW);
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
    fireEvent.change(screen.getByLabelText('调整原因'), { target: { value: '止损上移锁利' } });
    const confirmButton = screen.getByRole('button', { name: '确认调整' }) as HTMLButtonElement;

    fireEvent.change(stopInput, { target: { value: '100' } });
    expect(Number(stopInput.value)).toBe(100);
    await waitFor(() => expect(confirmButton.disabled).toBe(false));

    fireEvent.change(stopInput, { target: { value: '100.5' } });
    expect(Number(stopInput.value)).toBe(100.5);
    await waitFor(() => expect(confirmButton.disabled).toBe(false));

    // The value is no longer snapped back to the committed stop — the field shows what the trader
    // asked for, and the engine's own refusal is what stops it reaching the session.
    fireEvent.change(stopInput, { target: { value: '97' } });
    expect(Number(stopInput.value)).toBe(97);
    await waitFor(() => expect(confirmButton.disabled).toBe(true));
    expect(screen.getByRole('status').textContent).toContain('stays below the 100 entry');

    fireEvent.click(confirmButton);
    expect(amend).not.toHaveBeenCalled();
  });

  it('short: unlocks confirm at breakeven and below, and blocks on the engine refusal above it', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('short', 98); // entry 100 / stop 101 / reference 98 (past 1R)
    const { bridge, amend } = makeAmendBridge(makeOpenView('short', 98), REFUSE_ABOVE);
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
    fireEvent.change(screen.getByLabelText('调整原因'), { target: { value: '止损下移锁利' } });
    const confirmButton = screen.getByRole('button', { name: '确认调整' }) as HTMLButtonElement;

    fireEvent.change(stopInput, { target: { value: '100' } });
    expect(Number(stopInput.value)).toBe(100);
    await waitFor(() => expect(confirmButton.disabled).toBe(false));

    fireEvent.change(stopInput, { target: { value: '99.5' } });
    expect(Number(stopInput.value)).toBe(99.5);
    await waitFor(() => expect(confirmButton.disabled).toBe(false));

    fireEvent.change(stopInput, { target: { value: '102' } });
    expect(Number(stopInput.value)).toBe(102);
    await waitFor(() => expect(confirmButton.disabled).toBe(true));
    expect(screen.getByRole('status').textContent).toContain('stays above the 100 entry');

    fireEvent.click(confirmButton);
    expect(amend).not.toHaveBeenCalled();
  });

  it('asks the engine once the drag settles, never while the pointer is moving', async () => {
    const { handle, container } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge, validateAmend } = makeAmendBridge(makeOpenView('long', 102), REFUSE_BELOW);
    render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );
    await waitFor(() => expect(validateAmend).toHaveBeenCalledTimes(1));

    // stop 99 sits at y=201 under the linear map; drag it down through four frames.
    fireEvent.pointerDown(container, { clientY: 201 });
    fireEvent.pointerMove(window, { clientY: 202 });
    fireEvent.pointerMove(window, { clientY: 203 });
    fireEvent.pointerMove(window, { clientY: 204 });
    fireEvent.pointerMove(window, { clientY: 205 });
    expect(validateAmend).toHaveBeenCalledTimes(1);
    expect(Number((screen.getByLabelText('止损') as HTMLInputElement).value)).toBe(95);

    fireEvent.pointerUp(window);
    await waitFor(() => expect(validateAmend).toHaveBeenCalledTimes(2));
    expect(validateAmend).toHaveBeenLastCalledWith({ sessionId: 'run-1', stop: 95, target: 103 });
  });

  // getTrainerBridge() returns a new object literal per call. A mounting site that forgets to
  // memoise it must not turn every render — every drag frame — into an engine round trip.
  it('does not re-ask the engine just because the bridge object identity changed', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge, amend, validateAmend } = makeAmendBridge(view);
    const { rerender } = render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );
    await waitFor(() => expect(validateAmend).toHaveBeenCalledTimes(1));

    for (let i = 0; i < 5; i += 1) {
      rerender(
        <TrainerOrderPanel
          view={view}
          handle={handle}
          bridge={{ amend, validateAmend } as unknown as TrainerBridge}
          sessionId="run-1"
          onViewChange={() => {}}
        />,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(validateAmend).toHaveBeenCalledTimes(1);
  });

  it('locks the confirm button until a reason is entered', async () => {
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
    await waitFor(() => expect(confirmButton.disabled).toBe(false));
  });

  it('keeps confirm locked while an edit is still waiting on its verdict', async () => {
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
    fireEvent.change(screen.getByLabelText('调整原因'), { target: { value: '止损上移锁利' } });
    const confirmButton = screen.getByRole('button', { name: '确认调整' }) as HTMLButtonElement;
    await waitFor(() => expect(confirmButton.disabled).toBe(false));

    fireEvent.change(screen.getByLabelText('止损'), { target: { value: '100.5' } });
    expect(confirmButton.disabled).toBe(true);
    expect(screen.getByText('校验中…')).toBeTruthy();

    await waitFor(() => expect(confirmButton.disabled).toBe(false));
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
    const confirmButton = screen.getByRole('button', { name: '确认调整' }) as HTMLButtonElement;
    await waitFor(() => expect(confirmButton.disabled).toBe(false));
    fireEvent.click(confirmButton);

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

describe('TrainerOrderPanel entry reason (TD-REASON-01)', () => {
  it('locks the submit buttons until an entry reason is entered', () => {
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

    const limitButton = screen.getByRole('button', { name: '提交限价单' }) as HTMLButtonElement;
    const marketButton = screen.getByRole('button', { name: '照现价立刻进' }) as HTMLButtonElement;
    expect(limitButton.disabled).toBe(true);
    expect(marketButton.disabled).toBe(true);

    fireEvent.click(limitButton);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('入场理由'), {
      target: { value: '5 分钟级别突破前高，放量确认' },
    });
    expect(limitButton.disabled).toBe(false);
    expect(marketButton.disabled).toBe(false);
  });
});

describe('TrainerOrderPanel pending order cancel', () => {
  it('locks the cancel button until a reason is entered', () => {
    const { handle } = makeHandle();
    const view = makePendingView();
    const { bridge } = makeCancelBridge(view);
    render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: '撤销挂单' }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('撤单原因'), {
      target: { value: '行情走弱，不想再等成交' },
    });
    expect(cancelButton.disabled).toBe(false);
  });

  it('submits the cancel with the entered reason and applies the returned view', async () => {
    const { handle } = makeHandle();
    const view = makePendingView();
    const nextView = makeView({ phase: 'flat' });
    const { bridge, cancel } = makeCancelBridge(nextView);
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

    fireEvent.change(screen.getByLabelText('撤单原因'), {
      target: { value: '行情走弱，不想再等成交' },
    });
    fireEvent.click(screen.getByRole('button', { name: '撤销挂单' }));

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(cancel).toHaveBeenCalledWith({
      sessionId: 'run-1',
      reason: { category: 'thesis_invalidated', summary: '行情走弱，不想再等成交' },
    });
    await waitFor(() => expect(onViewChange).toHaveBeenCalledWith(nextView));
  });
});

describe('TrainerOrderPanel exit next open', () => {
  it('locks the exit button until a reason is entered, independent of the amend reason', () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge } = makeExitBridge(view);
    render(
      <TrainerOrderPanel
        view={view}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    const exitButton = screen.getByRole('button', { name: '下一根开盘平仓' }) as HTMLButtonElement;
    expect(exitButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('调整原因'), {
      target: { value: '止损上移到 100.5 锁利' },
    });
    expect(exitButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('平仓原因'), {
      target: { value: '结构走坏，提前离场' },
    });
    expect(exitButton.disabled).toBe(false);
  });

  it('submits exitNextOpen with the entered reason and applies the returned view', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const nextView = makeView({ phase: 'flat' });
    const { bridge, exitNextOpen } = makeExitBridge(nextView);
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

    fireEvent.change(screen.getByLabelText('平仓原因'), {
      target: { value: '结构走坏，提前离场' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一根开盘平仓' }));

    await waitFor(() => expect(exitNextOpen).toHaveBeenCalledTimes(1));
    expect(exitNextOpen).toHaveBeenCalledWith({
      sessionId: 'run-1',
      reason: { category: 'thesis_invalidated', summary: '结构走坏，提前离场' },
    });
    await waitFor(() => expect(onViewChange).toHaveBeenCalledWith(nextView));
  });
});

describe('TrainerOrderPanel position box lifecycle', () => {
  // The chart is not remounted when the episode ends, so a box left attached keeps painting the
  // last draft — a band at a price the trader never traded — over the settlement chart.
  it('detaches and clears its box when the panel unmounts', () => {
    const { handle, series } = makeHandle();
    const { bridge } = makeBridge();
    const { unmount } = render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={vi.fn()}
      />,
    );

    expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
    const box = series.attachPrimitive.mock.calls[0][0] as PositionBoxPrimitive;
    expect(box.state().data).not.toBeNull();

    unmount();

    expect(series.detachPrimitive).toHaveBeenCalledWith(box);
    expect(box.state().data).toBeNull();
  });
});
