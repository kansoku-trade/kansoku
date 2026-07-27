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
import { NO_REASON_GIVEN } from './orderDraft';
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

function lotsFor(sizes: number[]): TrainerPosition['lots'] {
  return sizes.map((size, i) => ({
    time: `2026-01-05T14:0${i}:00.000Z`,
    price: 100,
    size,
    remaining: size,
  }));
}

function makeOpenView(direction: TrainerDirection, referenceClose: number): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', referenceClose)];
  return makeView({
    phase: 'open',
    position: makePosition(direction),
    bars: { base, mid: base, top: base },
  });
}

function makeHeldView(sizes: number[], overrides: Partial<TrainerPosition> = {}): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', 102)];
  return makeView({
    phase: 'open',
    position: makePosition('long', { lots: lotsFor(sizes), ...overrides }),
    bars: { base, mid: base, top: base },
  });
}

// Linear price/pixel map (y = 300 - price) so the drag math is checkable by hand: the base close
// is $100, so the entry line sits at y=200 and a press at y=210 is a $90 stop.
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
  const chart = { applyOptions: vi.fn() };
  const handle = { chart, series, container } as unknown as DrawingChartHandle;
  return { handle, container, series, chart };
}

function okResult(view: TrainerView) {
  return {
    ok: true as const,
    data: { view, events: [], advancedBars: 0, terminal: false, result: null },
  };
}

function makeBridge(): { bridge: TrainerBridge; submit: ReturnType<typeof vi.fn> } {
  const submit = vi.fn(async () => okResult(makeView()));
  const bridge = { submit } as unknown as TrainerBridge;
  return { bridge, submit };
}

// Every method a spy, so "the drag path made no call" can be asserted against the whole surface
// rather than against the one method the test happened to think of.
function makeSpyBridge(view: TrainerView) {
  const methods = [
    'listPool',
    'open',
    'resume',
    'submit',
    'step',
    'amend',
    'validateAmend',
    'cancel',
    'exitNextOpen',
    'add',
    'reduce',
    'reveal',
  ] as const;
  const spies = Object.fromEntries(
    methods.map((name) => [name, vi.fn(async () => okResult(view))]),
  ) as Record<(typeof methods)[number], ReturnType<typeof vi.fn>>;
  return { bridge: spies as unknown as TrainerBridge, spies, methods };
}

function arm(direction: '做多' | '做空' = '做多') {
  fireEvent.click(screen.getByRole('button', { name: direction }));
}

function dragOnChart(container: HTMLElement, fromY: number, toY: number, frames = 1) {
  fireEvent.pointerDown(container, { clientY: fromY });
  for (let i = 1; i <= frames; i += 1) {
    fireEvent.pointerMove(window, { clientY: fromY + ((toY - fromY) * i) / frames });
  }
  fireEvent.pointerUp(window, { clientY: toY });
}

function placeOrder(
  container: HTMLElement,
  fromY: number,
  toY: number,
  direction: '做多' | '做空' = '做多',
) {
  arm(direction);
  dragOnChart(container, fromY, toY);
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
  const amend = vi.fn(async () => okResult(nextView));
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
  const cancel = vi.fn(async () => okResult(nextView));
  const bridge = { cancel } as unknown as TrainerBridge;
  return { bridge, cancel };
}

function makeSizingBridge(nextView: TrainerView): {
  bridge: TrainerBridge;
  add: ReturnType<typeof vi.fn>;
  reduce: ReturnType<typeof vi.fn>;
  validateAmend: ReturnType<typeof vi.fn>;
} {
  const add = vi.fn(async () => okResult(nextView));
  const reduce = vi.fn(async () => okResult(nextView));
  const validateAmend = vi.fn(async () => ({
    ok: true as const,
    data: { allowed: true, code: null, error: null },
  }));
  const bridge = { add, reduce, validateAmend } as unknown as TrainerBridge;
  return { bridge, add, reduce, validateAmend };
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

function renderPanel(view: TrainerView, bridge: TrainerBridge, handle: DrawingChartHandle | null) {
  return render(
    <TrainerOrderPanel
      view={view}
      handle={handle}
      bridge={bridge}
      sessionId="run-1"
      onViewChange={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('TrainerOrderPanel direction choice', () => {
  // The direction call is made before the chart is touched; the drag only locates the stop.
  it('arms the chart on the picked side and never derives a side from the drag', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    expect(screen.queryByRole('button', { name: '下单' })).toBeNull();
    const long = screen.getByRole('button', { name: '做多' }) as HTMLButtonElement;
    expect(long.ariaPressed).toBe('false');

    fireEvent.click(long);
    expect(long.ariaPressed).toBe('true');
    expect((screen.getByRole('button', { name: '做空' }) as HTMLButtonElement).ariaPressed).toBe(
      'false',
    );

    dragOnChart(container, 210, 175);
    expect(screen.getByText('入场做多')).toBeTruthy();
    expect(screen.queryByText('入场做空')).toBeNull();
  });

  it('reads the same drag as a short once 做空 is the picked side', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 190, 225, '做空');

    expect(screen.getByText('止损 110.00')).toBeTruthy();
    expect(screen.getByText('目标 75.00')).toBeTruthy();
    expect(screen.getByText('入场做空')).toBeTruthy();
  });

  it('switches side and drops the drawn lines when the other direction is picked', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    placeOrder(container, 210, 175);
    expect(screen.getByText('入场做多')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '做空' }));

    expect(screen.queryByText(/^止损 /)).toBeNull();
    expect((screen.getByRole('button', { name: '做空' }) as HTMLButtonElement).ariaPressed).toBe(
      'true',
    );
    dragOnChart(container, 190, 225);
    expect(screen.getByText('入场做空')).toBeTruthy();
  });

  it('re-arms and clears the drawn order when the picked side is pressed again', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    placeOrder(container, 210, 175);

    fireEvent.click(screen.getByRole('button', { name: '做多' }));

    expect(screen.queryByText(/^止损 /)).toBeNull();
    expect((screen.getByRole('button', { name: '做多' }) as HTMLButtonElement).ariaPressed).toBe(
      'true',
    );
  });

  // Placement arms a canvas-wide pointer capture that turns chart panning off; with the 下单
  // button gone, pressing the picked side again is the only way back out of it.
  it('backs out of an armed side with nothing drawn, handing panning back to the chart', () => {
    const { handle, chart } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();
    expect(chart.applyOptions).toHaveBeenLastCalledWith({
      handleScroll: false,
      handleScale: false,
    });

    fireEvent.click(screen.getByRole('button', { name: '做多' }));
    expect((screen.getByRole('button', { name: '做多' }) as HTMLButtonElement).ariaPressed).toBe(
      'false',
    );
    expect(chart.applyOptions).toHaveBeenLastCalledWith({ handleScroll: true, handleScale: true });
  });
});

describe('TrainerOrderPanel placement drag', () => {
  it('takes the press as the stop and the release as the target', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 210, 175);

    expect(screen.getByText('止损 90.00')).toBeTruthy();
    expect(screen.getByText('目标 125.00')).toBeTruthy();
    expect(screen.getByText('入场 100.00')).toBeTruthy();
  });

  it('shows the live prices before the pointer is released', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();
    fireEvent.pointerDown(container, { clientY: 210 });
    fireEvent.pointerMove(window, { clientY: 195 });
    expect(screen.getByText('止损 90.00')).toBeTruthy();
    expect(screen.getByText('目标 105.00')).toBeTruthy();

    fireEvent.pointerUp(window, { clientY: 195 });
    expect(screen.getByText('目标 105.00')).toBeTruthy();
  });

  // A drag that stays below entry has drawn a long whose target is a loss. Direction is no longer
  // in question, so the correction names the side that is wrong rather than the missing crossing.
  it('places nothing when the drag lands on the wrong side for the picked direction', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 210, 205);

    expect(screen.queryByText(/^止损 /)).toBeNull();
    expect(screen.getByText(/止损要在入场线 100.00 下方，目标要在上方，再拖一次/)).toBeTruthy();
    // The side stays armed so the next attempt needs no second press.
    expect((screen.getByRole('button', { name: '做多' }) as HTMLButtonElement).ariaPressed).toBe(
      'true',
    );
  });

  // The drag that used to *mean* "long" is now just a badly-placed short: the picked side wins and
  // the panel refuses rather than quietly flipping to the direction the gesture would have implied.
  it('refuses the long-shaped drag while 做空 is the picked side instead of flipping to a long', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 210, 175, '做空');

    expect(screen.queryByText('入场做多')).toBeNull();
    expect(screen.queryByText(/^止损 /)).toBeNull();
    expect(screen.getByText(/止损要在入场线 100.00 上方，目标要在下方，再拖一次/)).toBeTruthy();
  });

  it('ignores pointer events on the chart until a side is picked', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    dragOnChart(container, 210, 175);

    expect(screen.queryByText(/^止损 /)).toBeNull();
  });

  it('locks chart panning only while a side is armed', () => {
    const { handle, container, chart } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    expect(chart.applyOptions).not.toHaveBeenCalled();

    arm();
    expect(chart.applyOptions).toHaveBeenCalledWith({ handleScroll: false, handleScale: false });

    dragOnChart(container, 210, 175);
    expect(chart.applyOptions).toHaveBeenLastCalledWith({ handleScroll: true, handleScale: true });
  });

  it('keeps adjusting the drawn lines by their handles after the drag settles', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    placeOrder(container, 210, 175);

    // stop 90 sits at y=210 under the linear map; grab that edge and pull it up to 95.
    fireEvent.pointerDown(container, { clientY: 210 });
    fireEvent.pointerMove(window, { clientY: 205 });
    fireEvent.pointerUp(window, { clientY: 205 });

    expect(screen.getByText('止损 95.00')).toBeTruthy();
    expect(screen.getByText('目标 125.00')).toBeTruthy();
    expect(screen.getByText('入场做多')).toBeTruthy();
  });

  // A handle drag is fine-tuning, not a fresh direction call, so the stop may not cross to the
  // other side of entry and silently turn a long into something else.
  it('will not let a handle drag push the stop across the entry line', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    placeOrder(container, 210, 175);

    fireEvent.pointerDown(container, { clientY: 210 });
    fireEvent.pointerMove(window, { clientY: 150 });
    fireEvent.pointerUp(window, { clientY: 150 });

    expect(screen.getByText('止损 99.99')).toBeTruthy();
    expect(screen.getByText('入场做多')).toBeTruthy();
  });

  // The plan is re-read against the live price every render: once price runs past the target the
  // drawn lines no longer describe a long, and must stop offering to send one.
  it('withdraws a drawn order the price has since run past', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    const { rerender } = renderPanel(makeView(), bridge, handle);
    placeOrder(container, 210, 175);
    expect(screen.getByText('入场做多')).toBeTruthy();

    const moved = [bar('2026-01-05T14:00:00.000Z', 130), bar('2026-01-05T14:05:00.000Z', 130)];
    rerender(
      <TrainerOrderPanel
        view={makeView({ bars: { base: moved, mid: moved, top: moved } })}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    expect(screen.queryByText('入场做多')).toBeNull();
    expect(screen.getByText(/现价 130.00 已经越过你画的线/)).toBeTruthy();
  });
});

describe('TrainerOrderPanel submit', () => {
  it('sends a market order whose entry_plan matches the three prices on screen', async () => {
    const { handle, container } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 210, 175);
    fireEvent.change(screen.getByLabelText('入场理由'), {
      target: { value: '5 分钟突破前高，放量确认' },
    });
    fireEvent.click(screen.getByRole('button', { name: '入场做多 全仓' }));

    expect(submit).toHaveBeenCalledTimes(1);
    const call = submit.mock.calls[0][0] as {
      sessionId: string;
      submission: TrainerSubmission;
      entryMode: string;
      size: number;
    };
    expect(call.sessionId).toBe('run-1');
    expect(call.entryMode).toBe('market');
    expect(call.size).toBe(1);
    expect(call.submission.direction).toBe('long');
    expect(call.submission.entry_plan).toEqual({ entry: 100, stop: 90, target1: 125 });
    expect(call.submission.decision_reason).toEqual({
      category: 'other',
      summary: '5 分钟突破前高，放量确认',
    });
  });

  it('sends the short the drag drew', async () => {
    const { handle, container } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 190, 225, '做空');
    fireEvent.change(screen.getByLabelText('入场理由'), { target: { value: '跌破颈线，放量' } });
    fireEvent.click(screen.getByRole('button', { name: '入场做空 1/2' }));

    const call = submit.mock.calls[0][0] as {
      submission: TrainerSubmission;
      size: number;
    };
    expect(call.submission.direction).toBe('short');
    expect(call.submission.entry_plan).toEqual({ entry: 100, stop: 110, target1: 75 });
    expect(call.size).toBe(0.5);
  });

  it.each([
    ['入场做多 全仓', 1],
    ['入场做多 1/2', 0.5],
    ['入场做多 1/4', 0.25],
  ])('the %s button sends size %s', async (name, size) => {
    const { handle, container } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 210, 175);
    fireEvent.change(screen.getByLabelText('入场理由'), { target: { value: '突破前高' } });
    fireEvent.click(screen.getByRole('button', { name }));

    expect((submit.mock.calls[0][0] as { size: number }).size).toBe(size);
  });

  it('sends the entry with no reason typed at all', async () => {
    const { handle, container } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 210, 175);
    const full = screen.getByRole('button', { name: '入场做多 全仓' }) as HTMLButtonElement;
    expect(full.disabled).toBe(false);
    fireEvent.click(full);

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const call = submit.mock.calls[0][0] as { submission: TrainerSubmission };
    expect(call.submission.entry_plan).toEqual({ entry: 100, stop: 90, target1: 125 });
    expect(call.submission.decision_reason).toEqual({
      category: 'other',
      summary: NO_REASON_GIVEN,
    });
  });

  it('applies the returned view once the submit resolves', async () => {
    const { handle, container } = makeHandle();
    const nextView = makeView({ phase: 'pending' });
    const submit = vi.fn(async () => okResult(nextView));
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

    placeOrder(container, 210, 175);
    fireEvent.change(screen.getByLabelText('入场理由'), { target: { value: '突破前高' } });
    fireEvent.click(screen.getByRole('button', { name: '入场做多 全仓' }));
    await waitFor(() => expect(onViewChange).toHaveBeenCalledWith(nextView));
  });
});

describe('TrainerOrderPanel non-flat phase', () => {
  it('renders a status line instead of the entry form once an order exists', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makePendingView(), bridge, handle);

    expect(screen.queryByRole('button', { name: '做多' })).toBeNull();
    expect(screen.queryByRole('button', { name: '做空' })).toBeNull();
    expect(screen.getByText(/挂单中/)).toBeTruthy();
  });
});

describe('TrainerOrderPanel TD-RR-01 gate', () => {
  it('locks every entry button and warns the target just below the 1.5:1 floor', () => {
    const { handle, container } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    // stop 90 (y=210), target 114.99 (y=185.01) → 14.99 / 10 = 1.499
    placeOrder(container, 210, 185.01);

    for (const name of ['入场做多 全仓', '入场做多 1/2', '入场做多 1/4']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText('目标 114.99').className).toContain('trainer-order-field--warn');
    // The readout must round down, not to nearest — it must never display "1.50" (which would
    // read as clearing the floor) while the buttons above are disabled for missing it.
    expect(screen.getByText(/盈亏比/).textContent).toContain('1.49 : 1');

    fireEvent.click(screen.getByRole('button', { name: '入场做多 全仓' }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('unlocks exactly at the 1.5:1 floor', () => {
    const { handle, container } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    // stop 90 (y=210), target 115 (y=185) → 15 / 10 = 1.5
    placeOrder(container, 210, 185);

    for (const name of ['入场做多 全仓', '入场做多 1/2', '入场做多 1/4']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false);
    }
    expect(screen.getByText('目标 115.00').className).not.toContain('trainer-order-field--warn');
    expect(screen.getByText(/盈亏比/).textContent).toContain('1.50 : 1');
  });

  // TD-RR-01 is judged at the direction call, and an add is not one. A position whose remaining
  // plan is worth less than 1.5:1 may still be added to.
  it('does not re-judge the reward:risk floor on an add', () => {
    const { handle } = makeHandle();
    const view = makeHeldView([0.25], { stop: 99, target: 100.5, riskUnit: 1 });
    const { bridge } = makeSizingBridge(view);
    renderPanel(view, bridge, handle);

    expect((screen.getByRole('button', { name: '加仓 1/2' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  // The gate is about risk, not paperwork: a plan below the floor stays locked however much the
  // trader writes, and a plan above it is sendable with nothing written at all.
  it('stays keyed to the ratio alone, not to the entry reason', () => {
    const { handle, container } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(container, 210, 185.01);
    const full = screen.getByRole('button', { name: '入场做多 全仓' }) as HTMLButtonElement;
    expect(full.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('入场理由'), {
      target: { value: '写得再多也不该解锁' },
    });
    expect(full.disabled).toBe(true);
    fireEvent.click(full);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('TrainerOrderPanel position sizing', () => {
  it('sends an add with the size the button names and the reason typed for it', async () => {
    const { handle } = makeHandle();
    const view = makeHeldView([0.5]);
    const nextView = makeHeldView([0.5, 0.25]);
    const { bridge, add } = makeSizingBridge(nextView);
    renderPanel(view, bridge, handle);

    fireEvent.change(screen.getByLabelText('加仓理由'), { target: { value: '站稳 102，补 1/4' } });
    fireEvent.click(screen.getByRole('button', { name: '加仓 1/4' }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledWith({
      sessionId: 'run-1',
      size: 0.25,
      reason: { category: 'other', summary: '站稳 102，补 1/4' },
    });
  });

  // 加仓 全仓 fills the position up to 100%, so what it sends depends on what is already held.
  it.each([
    [[0.25], 0.75],
    [[0.5, 0.25], 0.25],
  ])('sends a fill-to-full add of %s as size %s', async (lots, expected) => {
    const { handle } = makeHandle();
    const view = makeHeldView(lots);
    const { bridge, add } = makeSizingBridge(view);
    renderPanel(view, bridge, handle);

    fireEvent.click(screen.getByRole('button', { name: '加仓 全仓' }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect((add.mock.calls[0][0] as { size: number }).size).toBe(expected);
  });

  it('sends a partial close as a sized reduce and a full close as an unsized one', async () => {
    const { handle } = makeHandle();
    const view = makeHeldView([1]);
    const { bridge, reduce } = makeSizingBridge(makeView({ phase: 'flat' }));
    renderPanel(view, bridge, handle);

    fireEvent.change(screen.getByLabelText('平仓原因'), { target: { value: '到第一目标，减半' } });
    fireEvent.click(screen.getByRole('button', { name: '平仓 1/2' }));
    await waitFor(() => expect(reduce).toHaveBeenCalledTimes(1));
    expect(reduce).toHaveBeenCalledWith({
      sessionId: 'run-1',
      size: 0.5,
      reason: { category: 'other', summary: '到第一目标，减半' },
    });

    fireEvent.change(screen.getByLabelText('平仓原因'), { target: { value: '结构走坏，全平' } });
    fireEvent.click(screen.getByRole('button', { name: '平仓 全仓' }));
    await waitFor(() => expect(reduce).toHaveBeenCalledTimes(2));
    expect(reduce).toHaveBeenLastCalledWith({
      sessionId: 'run-1',
      reason: { category: 'other', summary: '结构走坏，全平' },
    });
    expect(Object.keys(reduce.mock.calls[1][0] as object)).not.toContain('size');
  });

  it('sends the quarter close the button names', async () => {
    const { handle } = makeHandle();
    const view = makeHeldView([1]);
    const { bridge, reduce } = makeSizingBridge(makeHeldView([0.75]));
    renderPanel(view, bridge, handle);

    fireEvent.click(screen.getByRole('button', { name: '平仓 1/4' }));

    await waitFor(() => expect(reduce).toHaveBeenCalledTimes(1));
    expect((reduce.mock.calls[0][0] as { size: number }).size).toBe(0.25);
  });

  it('clears the add reason after the add lands, so the next one needs fresh words', async () => {
    const { handle } = makeHandle();
    const view = makeHeldView([0.25]);
    const { bridge, add } = makeSizingBridge(makeHeldView([0.25, 0.25]));
    renderPanel(view, bridge, handle);

    fireEvent.change(screen.getByLabelText('加仓理由'), { target: { value: '回踩不破，补仓' } });
    fireEvent.click(screen.getByRole('button', { name: '加仓 1/4' }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect((screen.getByLabelText('加仓理由') as HTMLInputElement).value).toBe(''),
    );
  });

  it('darkens an add that would exceed a full position and a reduce larger than the holding', () => {
    const { handle } = makeHandle();
    const full = makeHeldView([0.5, 0.5]);
    const { bridge } = makeSizingBridge(full);
    const { rerender } = renderPanel(full, bridge, handle);

    for (const name of ['加仓 1/2', '加仓 1/4', '加仓 全仓']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByRole('button', { name: '平仓 1/2' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    const quarter = makeHeldView([0.25]);
    rerender(
      <TrainerOrderPanel
        view={quarter}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    expect((screen.getByRole('button', { name: '加仓 1/2' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((screen.getByRole('button', { name: '加仓 全仓' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((screen.getByRole('button', { name: '平仓 1/2' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    // 全仓 closes whatever is left, so it is never "larger than the holding".
    expect((screen.getByRole('button', { name: '平仓 全仓' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('shows how much of a full position is still open', () => {
    const { handle } = makeHandle();
    const view = makeHeldView([0.5, 0.25]);
    const { bridge } = makeSizingBridge(view);
    renderPanel(view, bridge, handle);

    expect(screen.getByText(/仓位 75%/)).toBeTruthy();
  });
});

describe('TrainerOrderPanel TD-EXIT-01 gate (position amend)', () => {
  it('long: unlocks confirm at breakeven and above, and blocks on the engine refusal below it', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102); // entry 100 / stop 99 / reference 102 (past 1R)
    const { bridge, amend } = makeAmendBridge(makeOpenView('long', 102), REFUSE_BELOW);
    renderPanel(view, bridge, handle);
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
    renderPanel(view, bridge, handle);
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
    renderPanel(view, bridge, handle);
    await waitFor(() => expect(validateAmend).toHaveBeenCalledTimes(1));

    // stop 99 sits at y=201 under the linear map; drag it down through twelve frames.
    fireEvent.pointerDown(container, { clientY: 201 });
    for (let y = 202; y <= 213; y += 1) fireEvent.pointerMove(window, { clientY: y });
    expect(validateAmend).toHaveBeenCalledTimes(1);
    expect(Number((screen.getByLabelText('止损') as HTMLInputElement).value)).toBe(87);

    fireEvent.pointerUp(window);
    await waitFor(() => expect(validateAmend).toHaveBeenCalledTimes(2));
    expect(validateAmend).toHaveBeenLastCalledWith({ sessionId: 'run-1', stop: 87, target: 103 });
  });

  // getTrainerBridge() returns a new object literal per call. A mounting site that forgets to
  // memoise it must not turn every render — every drag frame — into an engine round trip.
  it('does not re-ask the engine just because the bridge object identity changed', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge, amend, validateAmend } = makeAmendBridge(view);
    const { rerender } = renderPanel(view, bridge, handle);
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

  it('keeps confirm locked while an edit is still waiting on its verdict', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge } = makeAmendBridge(view);
    renderPanel(view, bridge, handle);
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

describe('TrainerOrderPanel drag path stays off the wire', () => {
  it('makes no engine call at all across twelve placement frames and the release', async () => {
    const { handle, container } = makeHandle();
    const { bridge, spies, methods } = makeSpyBridge(makeView());
    renderPanel(makeView(), bridge, handle);

    arm();
    fireEvent.pointerDown(container, { clientY: 210 });
    for (let i = 1; i <= 12; i += 1) fireEvent.pointerMove(window, { clientY: 210 - i * 3 });
    for (const name of methods) expect(spies[name]).toHaveBeenCalledTimes(0);

    fireEvent.pointerUp(window, { clientY: 174 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByText('止损 90.00')).toBeTruthy();
    expect(screen.getByText('目标 126.00')).toBeTruthy();
    for (const name of methods) expect(spies[name]).toHaveBeenCalledTimes(0);
  });
});

describe('TrainerOrderPanel pending order cancel', () => {
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

// Reasons are kept for later review but gate nothing. An empty field must still travel as a
// non-empty summary: every reason crosses a boundary that validates minLength 1, so sending ''
// would turn "I had no words" into a protocol error.
describe('TrainerOrderPanel optional reasons', () => {
  it('leaves add and reduce unlocked with their reason fields empty, and marks what was sent', async () => {
    const { handle } = makeHandle();
    const view = makeHeldView([0.5]);
    const { bridge, add, reduce } = makeSizingBridge(view);
    renderPanel(view, bridge, handle);

    expect((screen.getByLabelText('加仓理由') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('平仓原因') as HTMLInputElement).value).toBe('');

    const addHalf = screen.getByRole('button', { name: '加仓 1/2' }) as HTMLButtonElement;
    const exitAll = screen.getByRole('button', { name: '平仓 全仓' }) as HTMLButtonElement;
    expect(addHalf.disabled).toBe(false);
    expect(exitAll.disabled).toBe(false);

    fireEvent.click(addHalf);
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledWith({
      sessionId: 'run-1',
      size: 0.5,
      reason: { category: 'other', summary: NO_REASON_GIVEN },
    });

    fireEvent.click(exitAll);
    await waitFor(() => expect(reduce).toHaveBeenCalledTimes(1));
    expect(reduce).toHaveBeenCalledWith({
      sessionId: 'run-1',
      reason: { category: 'other', summary: NO_REASON_GIVEN },
    });
  });

  it('leaves the amend confirm unlocked with no reason typed', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge, amend } = makeAmendBridge(view);
    renderPanel(view, bridge, handle);

    const confirmButton = screen.getByRole('button', { name: '确认调整' }) as HTMLButtonElement;
    await waitFor(() => expect(confirmButton.disabled).toBe(false));

    fireEvent.change(screen.getByLabelText('止损'), { target: { value: '100.5' } });
    await waitFor(() => expect(confirmButton.disabled).toBe(false));
    fireEvent.click(confirmButton);

    await waitFor(() => expect(amend).toHaveBeenCalledTimes(1));
    expect(amend).toHaveBeenCalledWith({
      sessionId: 'run-1',
      stop: 100.5,
      target: 103,
      reason: { category: 'other', summary: NO_REASON_GIVEN },
    });
  });

  it('leaves the pending-order cancel unlocked with no reason typed', async () => {
    const { handle } = makeHandle();
    const { bridge, cancel } = makeCancelBridge(makeView({ phase: 'flat' }));
    renderPanel(makePendingView(), bridge, handle);

    const cancelButton = screen.getByRole('button', { name: '撤销挂单' }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(false);
    fireEvent.click(cancelButton);

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(cancel).toHaveBeenCalledWith({
      sessionId: 'run-1',
      reason: { category: 'other', summary: NO_REASON_GIVEN },
    });
  });

  // 'risk_management' / 'thesis_invalidated' describe a judgment. Recording one for a field the
  // trader left blank would put words in their mouth.
  it('never labels an unwritten reason with the category the field was typed under', () => {
    const { handle } = makeHandle();
    const { bridge, amend } = makeAmendBridge(makeOpenView('long', 102));
    renderPanel(makeOpenView('long', 102), bridge, handle);

    fireEvent.click(screen.getByRole('button', { name: '确认调整' }));

    const sent = amend.mock.calls[0]?.[0] as { reason: { category: string } } | undefined;
    expect(sent?.reason.category).not.toBe('risk_management');
  });
});

describe('TrainerOrderPanel position box lifecycle', () => {
  // The chart is not remounted when the episode ends, so a box left attached keeps painting the
  // last draft — a band at a price the trader never traded — over the settlement chart.
  it('detaches and clears its box when the panel unmounts', () => {
    const { handle, series, container } = makeHandle();
    const { bridge } = makeBridge();
    const { unmount } = renderPanel(makeView(), bridge, handle);

    expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
    const box = series.attachPrimitive.mock.calls[0][0] as PositionBoxPrimitive;
    // Nothing is drawn until an order is being placed — an untouched trainer shows a clean chart.
    expect(box.state().data).toBeNull();

    placeOrder(container, 210, 175);
    expect(box.state().data).not.toBeNull();

    unmount();

    expect(series.detachPrimitive).toHaveBeenCalledWith(box);
    expect(box.state().data).toBeNull();
  });

  it('draws the entry line alone the moment a side is picked', () => {
    const { handle, series } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    const box = series.attachPrimitive.mock.calls[0][0] as PositionBoxPrimitive;

    arm();

    expect(box.state().data).toMatchObject({ entry: 100, stop: 100, target1: 100 });
  });
});
