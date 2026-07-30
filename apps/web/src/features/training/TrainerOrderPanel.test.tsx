// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  TrainerDirection,
  TrainerPosition,
  TrainerStepEvent,
  TrainerSubmission,
  TrainerView,
} from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { OrderZonePrimitive } from '../charts/intraday/orderZonePrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { NO_REASON_GIVEN } from './orderDraft';
import { sec } from './replayBands';
import { TrainerOrderPanel } from './TrainerOrderPanel';
import { TrainerOverlayLayer, TrainerOverlayProvider } from './trainerOverlay';

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
    submitted: false,
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

interface FakePriceLine {
  price: number;
  color: string;
  removed: boolean;
  applyOptions: ReturnType<typeof vi.fn>;
}

// Linear price/pixel map (y = 300 - price) so the drag math is checkable by hand: the base close
// is $100, so the entry line sits at y=200 and a press at y=210 is a $90 stop.
function makeHandle(paneSize = { width: 236, height: 274 }) {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0 }) as DOMRect;
  const zonePrimitives: OrderZonePrimitive[] = [];
  const priceLines: FakePriceLine[] = [];
  const createPriceLine = vi.fn((options: { price: number; color: string }) => {
    const line: FakePriceLine = {
      price: options.price,
      color: options.color,
      removed: false,
      applyOptions: vi.fn((patch: { price?: number }) => {
        if (patch.price !== undefined) line.price = patch.price;
      }),
    };
    priceLines.push(line);
    return line;
  });
  const removePriceLine = vi.fn((line: FakePriceLine) => {
    line.removed = true;
  });
  const series = {
    attachPrimitive: (p: OrderZonePrimitive) => zonePrimitives.push(p),
    detachPrimitive: vi.fn(),
    priceToCoordinate: (price: number) => 300 - price,
    coordinateToPrice: (y: number) => 300 - y,
    createPriceLine,
    removePriceLine,
  };
  // Narrower and shorter than the 300x300 container: the price axis on the right and the time axis
  // below are outside the pane, and nothing grabbable may reach into them.
  const chart = { applyOptions: vi.fn(), paneSize: () => paneSize };
  const handle = { chart, series, container } as unknown as DrawingChartHandle;
  return { handle, container, series, chart, zonePrimitives, priceLines };
}

function currentZone(zonePrimitives: OrderZonePrimitive[]) {
  return zonePrimitives.at(-1)?.state().data ?? null;
}

function okResult(view: TrainerView) {
  return {
    ok: true as const,
    data: { view, events: [], advancedBars: 0, terminal: false, result: null },
  };
}

// A market submit is followed by the one-bar advance that fills it, so `step` is part of the
// minimum surface a submitting panel needs.
function makeBridge(): {
  bridge: TrainerBridge;
  submit: ReturnType<typeof vi.fn>;
  step: ReturnType<typeof vi.fn>;
} {
  const submit = vi.fn(async () => okResult(makeView()));
  const step = vi.fn(async () => okResult(makeView()));
  const bridge = { submit, step } as unknown as TrainerBridge;
  return { bridge, submit, step };
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

function hitBand(kind: 'target' | 'stop'): HTMLElement | null {
  return document.querySelector(`.trainer-level--${kind} .trainer-level-hit`);
}

// The full-width band is the whole grabbable line and the only surface a real pointer can land on,
// so every level drag below is driven through it rather than through the canvas.
function dragBand(kind: 'target' | 'stop', fromY: number, toY: number, frames = 1) {
  fireEvent.pointerDown(hitBand(kind)!, { clientY: fromY });
  for (let i = 1; i <= frames; i += 1) {
    fireEvent.pointerMove(window, { clientY: fromY + ((toY - fromY) * i) / frames });
  }
  fireEvent.pointerUp(window, { clientY: toY });
}

// The TP/SL pulls live inside the entry ticket's expanded state, which a real pointer would already
// be over on its way to a handle — so the drag helpers below point at the ticket first.
function hoverEntry() {
  const pill = document.querySelector('.trainer-level--entry .trainer-level-pill');
  if (pill) fireEvent.pointerEnter(pill);
}

// Levels are pulled out of the entry ticket: press the TP or SL handle, drag, drop. The handle is
// in the overlay rather than on the canvas, so the drag rides window listeners from pointerdown.
function pull(handle: 'TP' | 'SL', toY: number, frames = 1) {
  hoverEntry();
  const button = screen.getByRole('button', { name: `拖出${handle}` });
  fireEvent.pointerDown(button);
  for (let i = 1; i <= frames; i += 1) {
    fireEvent.pointerMove(window, { clientY: 200 + ((toY - 200) * i) / frames });
  }
  fireEvent.pointerUp(window, { clientY: toY });
}

function placeOrder(stopY: number, targetY: number, direction: '做多' | '做空' = '做多') {
  arm(direction);
  pull('SL', stopY);
  pull('TP', targetY);
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

// The position status, the amend confirm and every error are painted onto the chart rather than
// into the lane, so they only exist once an overlay layer is mounted — TrainerChart always mounts
// one for a live episode.
function Overlay({ children }: { children: ReactNode }) {
  return (
    <TrainerOverlayProvider>
      {children}
      <TrainerOverlayLayer />
    </TrainerOverlayProvider>
  );
}

function renderPanel(
  view: TrainerView,
  bridge: TrainerBridge,
  handle: DrawingChartHandle | null,
  extra: { drawingActive?: boolean; onTakeChart?: () => void } = {},
) {
  return render(
    <TrainerOrderPanel
      view={view}
      handle={handle}
      bridge={bridge}
      sessionId="run-1"
      onViewChange={() => {}}
      {...extra}
    />,
    { wrapper: Overlay },
  );
}

// The reason field lives behind a popover now: one note per lane, attached to whichever action
// the trader fires next.
function note(label = '备注'): HTMLInputElement {
  const open = screen.queryByLabelText(`${label}内容`);
  if (open) return open as HTMLInputElement;
  fireEvent.click(screen.getByRole('button', { name: label }));
  return screen.getByLabelText(`${label}内容`) as HTMLInputElement;
}

// The entry buttons live on the ticket and stay on screen while the plan is incomplete or refused,
// disabled with a reason. So "is there a plan good enough to send" is the button being enabled, not
// merely present.
function draftFor(direction: '做多' | '做空') {
  const button = screen.queryByRole('button', {
    name: `入场${direction} 全仓`,
  }) as HTMLButtonElement | null;
  return button && !button.disabled ? button : null;
}

// makeHandle maps y = 300 - price, so a level move is expressible as the two prices it goes
// between.
function dragLevel(kind: 'target' | 'stop', fromPrice: number, toPrice: number) {
  dragBand(kind, 300 - fromPrice, 300 - toPrice);
}

function typeNote(text: string, label = '备注') {
  fireEvent.change(note(label), { target: { value: text } });
}

// The confirm rides the dragged level on the chart and only exists while an edit is pending, so
// every amend test has to move a line before there is anything to confirm.
function confirmAmend(): HTMLButtonElement {
  return screen.getByRole('button', { name: '确认调整' }) as HTMLButtonElement;
}

// Each level now carries its own ticket on its line; a pending edit turns that ticket into the
// confirm prompt, so "what is the pending edit showing" is the pill's own text.
function pendingPill(): HTMLElement | null {
  const pill = [...document.querySelectorAll('.trainer-level-pill')].find((el) =>
    el.textContent?.includes('→'),
  );
  return (pill as HTMLElement | undefined) ?? null;
}

function levelPill(kind: 'target' | 'entry' | 'stop'): HTMLElement | null {
  return document.querySelector(`.trainer-level--${kind} .trainer-level-pill`);
}

afterEach(() => {
  cleanup();
});

describe('TrainerOrderPanel direction choice', () => {
  // The direction call is made before the chart is touched; the drag only locates the stop.
  it('arms the chart on the picked side and never derives a side from the drag', () => {
    const { handle } = makeHandle();
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

    pull('SL', 210);
    pull('TP', 175);
    expect(draftFor('做多')).toBeTruthy();
    expect(draftFor('做空')).toBeNull();
  });

  it('reads the same drag as a short once 做空 is the picked side', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(190, 225, '做空');

    expect(screen.getByText('止损 110.00')).toBeTruthy();
    expect(screen.getByText('目标 75.00')).toBeTruthy();
    expect(draftFor('做空')).toBeTruthy();
  });

  it('switches side and drops the drawn lines when the other direction is picked', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    placeOrder(210, 175);
    expect(draftFor('做多')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '做空' }));

    expect(screen.queryByText(/^止损 /)).toBeNull();
    expect((screen.getByRole('button', { name: '做空' }) as HTMLButtonElement).ariaPressed).toBe(
      'true',
    );
    pull('SL', 190);
    pull('TP', 225);
    expect(draftFor('做空')).toBeTruthy();
  });

  it('drops the whole plan when the picked side is pressed again', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    placeOrder(210, 175);

    fireEvent.click(screen.getByRole('button', { name: '做多' }));

    expect(levelPill('entry')).toBeNull();
    expect(levelPill('stop')).toBeNull();
    expect((screen.getByRole('button', { name: '做多' }) as HTMLButtonElement).ariaPressed).toBe(
      'false',
    );
  });

  // Placement used to arm a canvas-wide pointer capture and turn panning off for as long as a side
  // was picked. Levels are pulled out of the ticket by their own handles now, so ordinary chart
  // panning is never taken away — only a drawing tool still claims the canvas.
  it('never takes chart panning away to place an order', () => {
    const { handle, chart } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();
    pull('SL', 210);
    pull('TP', 175);

    expect(chart.applyOptions).not.toHaveBeenCalledWith({
      handleScroll: false,
      handleScale: false,
    });
  });
});

describe('TrainerOrderPanel placement drag', () => {
  it('takes the press as the stop and the release as the target', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);

    expect(screen.getByText('止损 90.00')).toBeTruthy();
    expect(screen.getByText('目标 125.00')).toBeTruthy();
    expect(screen.getByText('入场 100.00')).toBeTruthy();
  });

  // The pointer leaves the handle immediately and spends the drag over the chart canvas, which
  // sets its own crosshair cursor. Without a document-level lock the grab silently stops looking
  // like a grab halfway through.
  it('holds the resize cursor for the whole pull, and drops it on release', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    const held = () => document.body.classList.contains('trainer-dragging-level');

    arm();
    hoverEntry();
    expect(held()).toBe(false);

    fireEvent.pointerDown(screen.getByRole('button', { name: '拖出SL' }));
    expect(held()).toBe(true);
    fireEvent.pointerMove(window, { clientY: 210 });
    expect(held()).toBe(true);

    fireEvent.pointerUp(window, { clientY: 210 });
    expect(held()).toBe(false);
  });

  it('drops the cursor lock when the pointer is cancelled rather than released', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();
    hoverEntry();
    fireEvent.pointerDown(screen.getByRole('button', { name: '拖出SL' }));
    fireEvent.pointerCancel(window);

    expect(document.body.classList.contains('trainer-dragging-level')).toBe(false);
  });

  // Unmounting mid-drag (the case switches, the trade fills) would otherwise strand the whole
  // document in a resize cursor with no pointer release left to clear it.
  it('drops the cursor lock if the panel unmounts mid-drag', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    const { unmount } = renderPanel(makeView(), bridge, handle);

    arm();
    hoverEntry();
    fireEvent.pointerDown(screen.getByRole('button', { name: '拖出SL' }));
    expect(document.body.classList.contains('trainer-dragging-level')).toBe(true);

    unmount();
    expect(document.body.classList.contains('trainer-dragging-level')).toBe(false);
  });

  it('shows the level following the pointer before it is released', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();
    hoverEntry();
    fireEvent.pointerDown(screen.getByRole('button', { name: '拖出SL' }));
    fireEvent.pointerMove(window, { clientY: 210 });
    expect(levelPill('stop')?.textContent).toContain('90.00');

    fireEvent.pointerMove(window, { clientY: 205 });
    expect(levelPill('stop')?.textContent).toContain('95.00');

    fireEvent.pointerUp(window, { clientY: 205 });
    expect(levelPill('stop')?.textContent).toContain('95.00');
  });

  // Each level is pulled on its own now, so a level dropped on the wrong side of entry is a slip of
  // one hand rather than a malformed two-ended gesture. Snapping it to the nearest legal price
  // keeps the other leg — refusing the whole pull would throw away work the trader did correctly.
  it('snaps a level dropped on the wrong side of entry instead of discarding the pull', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();
    pull('TP', 175);
    pull('SL', 195); // 105, above the 100 entry — illegal for a long stop

    expect(levelPill('stop')?.textContent).toContain('99.99');
    expect(levelPill('target')?.textContent).toContain('125.00');
  });

  it('mirrors the clamp for a short, whose stop belongs above entry', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm('做空');
    pull('SL', 210); // 90, below the 100 entry — illegal for a short stop

    expect(levelPill('stop')?.textContent).toContain('100.01');
  });

  // Nothing on the chart is grabbable before a side is picked: there is no line to grab, so the
  // pane belongs entirely to panning and to the drawing tools.
  it('puts no grabbable band on the chart until a side is picked', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    expect(document.querySelectorAll('.trainer-level-hit')).toHaveLength(0);
    expect(screen.queryByText(/^止损 /)).toBeNull();
  });

  // Panning is the trader's, not the order tool's: a drawing tool is the only thing that still
  // claims the canvas, and placing an order no longer touches it at any point.
  it('leaves chart panning alone through a whole placement', () => {
    const { handle, chart } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);

    expect(chart.applyOptions).not.toHaveBeenCalledWith({
      handleScroll: false,
      handleScale: false,
    });
  });

  it('keeps adjusting the drawn lines by their handles after the drag settles', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    placeOrder(210, 175);

    // stop 90 sits at y=210 under the linear map; grab that line and pull it up to 95.
    dragBand('stop', 210, 205);

    expect(screen.getByText('止损 95.00')).toBeTruthy();
    expect(screen.getByText('目标 125.00')).toBeTruthy();
    expect(draftFor('做多')).toBeTruthy();
  });

  // A handle drag is fine-tuning, not a fresh direction call, so the stop may not cross to the
  // other side of entry and silently turn a long into something else.
  it('will not let a handle drag push the stop across the entry line', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);
    placeOrder(210, 175);

    dragBand('stop', 210, 150);

    expect(screen.getByText('止损 99.99')).toBeTruthy();
    expect(draftFor('做多')).toBeTruthy();
  });

  // The plan is re-read against the live price every render: once price runs past the target the
  // drawn lines no longer describe a long, and must stop offering to send one.
  it('withdraws a drawn order the price has since run past', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    const { rerender } = renderPanel(makeView(), bridge, handle);
    placeOrder(210, 175);
    expect(draftFor('做多')).toBeTruthy();

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

    expect(draftFor('做多')).toBeNull();
    expect(screen.getByText(/现价 130.00 已经越过你放的线/)).toBeTruthy();
  });
});

describe('TrainerOrderPanel submit', () => {
  it('sends a market order whose entry_plan matches the three prices on screen', async () => {
    const { handle } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    fireEvent.change(note(), {
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
    const { handle } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(190, 225, '做空');
    fireEvent.change(note(), { target: { value: '跌破颈线，放量' } });
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
    const { handle } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    fireEvent.change(note(), { target: { value: '突破前高' } });
    fireEvent.click(screen.getByRole('button', { name }));

    expect((submit.mock.calls[0][0] as { size: number }).size).toBe(size);
  });

  it('sends the entry with no reason typed at all', async () => {
    const { handle } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
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

  // The market order rests in `pending` until a bar is advanced, so the view the trader ends up
  // looking at is the fill's, not the submit's — applying the submit's would leave them staring at
  // a resting order that has in fact already filled.
  it('applies the filled view, not the resting one the submit returned', async () => {
    const { handle } = makeHandle();
    const pendingView = makeView({ phase: 'pending' });
    const filledView = makeOpenView('long', 102);
    const submit = vi.fn(async () => okResult(pendingView));
    const step = vi.fn(async () => okResult(filledView));
    const validateAmend = vi.fn(async () => ({
      ok: true as const,
      data: { allowed: true, code: null, error: null },
    }));
    const bridge = { submit, step, validateAmend } as unknown as TrainerBridge;
    const onViewChange = vi.fn();
    render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={onViewChange}
      />,
      { wrapper: Overlay },
    );

    placeOrder(210, 175);
    typeNote('突破前高');
    fireEvent.click(screen.getByRole('button', { name: '入场做多 全仓' }));

    await waitFor(() => expect(onViewChange).toHaveBeenCalledWith(filledView));
    expect(onViewChange).not.toHaveBeenCalledWith(pendingView);
    // One base bar, never the tier the chart happens to be showing: a coarser tier would swallow
    // several bars of the episode to fill one order.
    expect(step).toHaveBeenCalledWith({
      sessionId: 'run-1',
      action: {
        type: 'hold',
        bars: 1,
        period: '5m',
        reason: { category: 'other', summary: '突破前高' },
      },
    });
  });

  it('says the fill happened even when the same bar also ends the trade', async () => {
    const { handle } = makeHandle();
    const submit = vi.fn(async () => okResult(makeView({ phase: 'pending' })));
    const events: TrainerStepEvent[] = [
      { barOffset: 1, cursor: 2, at: '2026-01-05T14:10:00.000Z', event: 'stop_hit' },
    ];
    const step = vi.fn(async () => ({
      ok: true as const,
      data: { view: makeView(), events, advancedBars: 1, terminal: false, result: null },
    }));
    const bridge = { submit, step } as unknown as TrainerBridge;
    const { rerender } = render(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
      { wrapper: Overlay },
    );

    placeOrder(210, 175);
    fireEvent.click(screen.getByRole('button', { name: '入场做多 全仓' }));

    await waitFor(() =>
      expect(document.querySelector('.trainer-overlay-stack')?.textContent).toContain(
        '按下一根 5m 开盘成交，同一根就打到止损',
      ),
    );

    // The sentence is about the bar that filled; once the trader has stepped past it, leaving it on
    // the chart would describe a bar no longer under the cursor.
    rerender(
      <TrainerOrderPanel
        view={makeView({ cursor: 4 })}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );
    expect(document.querySelector('.trainer-overlay-stack')?.textContent).not.toContain('成交');
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
    const { handle } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    // stop 90 (y=210), target 114.99 (y=185.01) → 14.99 / 10 = 1.499
    placeOrder(210, 185.01);

    for (const name of ['入场做多 全仓', '入场做多 1/2', '入场做多 1/4']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText('目标 114.99').className).toContain('trainer-lane-num--warn');
    // The readout must round down, not to nearest — it must never display "1.50" (which would
    // read as clearing the floor) while the buttons above are disabled for missing it.
    expect(screen.getByText(/盈亏比/).textContent).toContain('1.49 : 1');

    fireEvent.click(screen.getByRole('button', { name: '入场做多 全仓' }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('unlocks exactly at the 1.5:1 floor', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    // stop 90 (y=210), target 115 (y=185) → 15 / 10 = 1.5
    placeOrder(210, 185);

    for (const name of ['入场做多 全仓', '入场做多 1/2', '入场做多 1/4']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false);
    }
    expect(screen.getByText('目标 115.00').className).not.toContain('trainer-lane-num--warn');
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
    const { handle } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 185.01);
    const full = screen.getByRole('button', { name: '入场做多 全仓' }) as HTMLButtonElement;
    expect(full.disabled).toBe(true);

    fireEvent.change(note(), {
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

    fireEvent.change(note(), { target: { value: '站稳 102，补 1/4' } });
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

    fireEvent.change(note(), { target: { value: '到第一目标，减半' } });
    fireEvent.click(screen.getByRole('button', { name: '平仓 1/2' }));
    await waitFor(() => expect(reduce).toHaveBeenCalledTimes(1));
    expect(reduce).toHaveBeenCalledWith({
      sessionId: 'run-1',
      size: 0.5,
      reason: { category: 'other', summary: '到第一目标，减半' },
    });

    fireEvent.change(note(), { target: { value: '结构走坏，全平' } });
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

    fireEvent.change(note(), { target: { value: '回踩不破，补仓' } });
    fireEvent.click(screen.getByRole('button', { name: '加仓 1/4' }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((note() as HTMLInputElement).value).toBe(''));
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

// Driven through the hit band, which is the only surface a real pointer can land on: a discipline
// assertion that rides a path no pointer takes proves nothing about the shipped behaviour.
describe('TrainerOrderPanel TD-EXIT-01 gate (position amend)', () => {
  it('long: unlocks confirm at breakeven and above, and blocks on the engine refusal below it', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102); // entry 100 / stop 99 / reference 102 (past 1R)
    const { bridge, amend } = makeAmendBridge(makeOpenView('long', 102), REFUSE_BELOW);
    renderPanel(view, bridge, handle);
    typeNote('止损上移锁利');

    dragLevel('stop', 99, 100);
    await waitFor(() => expect(confirmAmend().disabled).toBe(false));

    dragLevel('stop', 100, 100.5);
    await waitFor(() => expect(confirmAmend().disabled).toBe(false));

    // The dragged level is no longer snapped back to the committed stop — the chip shows what the
    // trader asked for, and the engine's own refusal is what stops it reaching the session.
    dragLevel('stop', 100.5, 97);
    // From-then-to, in the direction the move actually happens: a ticket reading "97.00 | 99.00 →"
    // points its arrow at nothing.
    expect(pendingPill()?.textContent).toMatch(/99\.00\s*→\s*97\.00/);
    await waitFor(() => expect(confirmAmend().disabled).toBe(true));
    expect(screen.getByRole('status').textContent).toContain('stays below the 100 entry');

    fireEvent.click(confirmAmend());
    expect(amend).not.toHaveBeenCalled();
  });

  it('short: unlocks confirm at breakeven and below, and blocks on the engine refusal above it', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('short', 98); // entry 100 / stop 101 / reference 98 (past 1R)
    const { bridge, amend } = makeAmendBridge(makeOpenView('short', 98), REFUSE_ABOVE);
    renderPanel(view, bridge, handle);
    typeNote('止损下移锁利');

    dragLevel('stop', 101, 100);
    await waitFor(() => expect(confirmAmend().disabled).toBe(false));

    dragLevel('stop', 100, 99.5);
    await waitFor(() => expect(confirmAmend().disabled).toBe(false));

    dragLevel('stop', 99.5, 102);
    expect(pendingPill()?.textContent).toMatch(/101\.00\s*→\s*102\.00/);
    await waitFor(() => expect(confirmAmend().disabled).toBe(true));
    expect(screen.getByRole('status').textContent).toContain('stays above the 100 entry');

    fireEvent.click(confirmAmend());
    expect(amend).not.toHaveBeenCalled();
  });

  it('asks the engine once the drag settles, never while the pointer is moving', async () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge, validateAmend } = makeAmendBridge(makeOpenView('long', 102), REFUSE_BELOW);
    renderPanel(view, bridge, handle);
    await waitFor(() => expect(validateAmend).toHaveBeenCalledTimes(1));

    // stop 99 sits at y=201 under the linear map; drag it down through twelve frames.
    fireEvent.pointerDown(hitBand('stop')!, { clientY: 201 });
    for (let y = 202; y <= 213; y += 1) fireEvent.pointerMove(window, { clientY: y });
    expect(validateAmend).toHaveBeenCalledTimes(1);
    expect(pendingPill()?.textContent).toMatch(/99\.00\s*→\s*87\.00/);

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
    const { bridge, validateAmend } = makeAmendBridge(view);
    renderPanel(view, bridge, handle);
    typeNote('止损上移锁利');
    await waitFor(() => expect(validateAmend).toHaveBeenCalledTimes(1));

    dragLevel('stop', 99, 100.5);
    expect(confirmAmend().disabled).toBe(true);
    expect(screen.getByText('校验中…')).toBeTruthy();

    await waitFor(() => expect(confirmAmend().disabled).toBe(false));
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
      { wrapper: Overlay },
    );

    dragLevel('stop', 99, 100.5);
    typeNote('止损上移到 100.5 锁利');
    await waitFor(() => expect(confirmAmend().disabled).toBe(false));
    fireEvent.click(confirmAmend());

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
    const { handle } = makeHandle();
    const { bridge, spies, methods } = makeSpyBridge(makeView());
    renderPanel(makeView(), bridge, handle);

    arm();
    pull('SL', 210);
    fireEvent.pointerDown(screen.getByRole('button', { name: '拖出TP' }));
    for (let i = 1; i <= 12; i += 1) fireEvent.pointerMove(window, { clientY: 210 - i * 3 });
    for (const name of methods) expect(spies[name]).toHaveBeenCalledTimes(0);

    fireEvent.pointerUp(window, { clientY: 174 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(levelPill('stop')?.textContent).toContain('90.00');
    expect(levelPill('target')?.textContent).toContain('126.00');
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

    fireEvent.change(note(), {
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

    expect((note() as HTMLInputElement).value).toBe('');
    expect((note() as HTMLInputElement).value).toBe('');

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

    dragLevel('stop', 99, 100.5);
    await waitFor(() => expect(confirmAmend().disabled).toBe(false));
    fireEvent.click(confirmAmend());

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
  it('never labels an unwritten reason with the category the field was typed under', async () => {
    const { handle } = makeHandle();
    const { bridge, amend } = makeAmendBridge(makeOpenView('long', 102));
    renderPanel(makeOpenView('long', 102), bridge, handle);

    dragLevel('stop', 99, 100.5);
    await waitFor(() => expect(confirmAmend().disabled).toBe(false));
    fireEvent.click(confirmAmend());

    await waitFor(() => expect(amend).toHaveBeenCalledTimes(1));
    const sent = amend.mock.calls[0]?.[0] as { reason: { category: string } } | undefined;
    expect(sent?.reason.category).not.toBe('risk_management');
  });
});

describe('TrainerOrderPanel position box lifecycle', () => {
  // The chart is not remounted when the episode ends, so a box left attached keeps painting the
  // last draft — a band at a price the trader never traded — over the settlement chart.
  // The chart outlives this panel: it stays mounted through the switch to the settlement screen, so
  // a level left behind would paint on the settlement chart as a position that was never taken.
  it('leaves no level behind when the panel unmounts', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    const { unmount } = renderPanel(makeView(), bridge, handle);

    // Nothing is drawn until an order is being placed — an untouched trainer shows a clean chart.
    expect(document.querySelectorAll('.trainer-level')).toHaveLength(0);

    placeOrder(210, 175);
    expect(document.querySelectorAll('.trainer-level').length).toBeGreaterThan(0);

    unmount();
    expect(document.querySelectorAll('.trainer-level')).toHaveLength(0);
  });

  // The entry is the price the drag has to straddle, so it has to be on the chart while the trader
  // is still aiming — before there is any stop or target to draw beside it.
  it('draws the entry line alone the moment a side is picked', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();

    expect(levelPill('entry')?.textContent).toContain('100.00');
    expect(levelPill('stop')).toBeNull();
    expect(levelPill('target')).toBeNull();
  });

  it('puts what each level is worth on its own ticket, with the stop at exactly -1R', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    // entry 100, stop 90 (risk 10), target 125 -> +2.5R
    placeOrder(210, 175);

    fireEvent.pointerEnter(levelPill('stop')!);
    expect(levelPill('stop')?.textContent).toContain('-1.0R');
    fireEvent.pointerEnter(levelPill('target')!);
    expect(levelPill('target')?.textContent).toContain('+2.5R');
    hoverEntry();
    expect(levelPill('entry')?.textContent).toContain('市价');
  });
});

describe('TrainerOrderPanel order zone primitive', () => {
  it('feeds the primitive the prices the drag puts on the ticket, and keeps it live as they move', () => {
    const { handle, zonePrimitives } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    expect(currentZone(zonePrimitives)).toMatchObject({
      entry: 100,
      stop: 90,
      target: 125,
      filled: false,
      rewardR: 2.5,
      riskR: -1,
      belowFloor: false,
    });

    dragBand('stop', 210, 205);

    expect(currentZone(zonePrimitives)?.stop).toBe(95);
  });

  it('withholds the zone entirely until a stop exists — the risk leg defines the unit', () => {
    const { handle, zonePrimitives } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();

    expect(currentZone(zonePrimitives)).toBeNull();
  });

  it('draws the risk block alone, with target null, once only the stop has been pulled', () => {
    const { handle, zonePrimitives } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();
    pull('SL', 210);

    expect(currentZone(zonePrimitives)).toMatchObject({
      entry: 100,
      stop: 90,
      target: null,
      filled: false,
    });
  });

  it('anchors the open-position zone to the entry bar rather than the replay cursor, and marks it filled', async () => {
    const { handle, zonePrimitives } = makeHandle();
    const base = [bar('2026-01-05T14:00:00.000Z', 100), bar('2026-01-05T14:05:00.000Z', 102)];
    const view = makeView({
      phase: 'open',
      position: makePosition('long'),
      bars: { base, mid: base, top: base },
    });
    const { bridge, validateAmend } = makeAmendBridge(view);
    renderPanel(view, bridge, handle);
    await waitFor(() => expect(validateAmend).toHaveBeenCalledTimes(1));

    const zone = currentZone(zonePrimitives);
    expect(zone?.filled).toBe(true);
    expect(zone?.startTime).toBe(sec('2026-01-05T14:00:00.000Z'));
    expect(zone?.startTime).not.toBe(sec('2026-01-05T14:05:00.000Z'));
  });

  // Every other fixture here aliases bars.mid/top to bars.base, which hides the whole class of bug
  // where the anchor is a base-period timestamp that no aggregated tier holds as a bar time.
  it('hands over the base cursor bar time even when the tiers are genuinely distinct', () => {
    const { handle, zonePrimitives } = makeHandle();
    const { bridge } = makeBridge();
    const base = [
      bar('2026-01-05T14:00:00.000Z', 100),
      bar('2026-01-05T14:05:00.000Z', 100),
      bar('2026-01-05T14:10:00.000Z', 100),
    ];
    const aggregated = [bar('2026-01-05T14:00:00.000Z', 100)];
    const view = makeView({
      bars: { base, mid: aggregated, top: aggregated },
      cursor: base.length - 1,
      asOf: base.at(-1)!.time,
    });
    renderPanel(view, bridge, handle);

    arm();
    pull('SL', 210);

    // 14:10 is a 5m bar sitting inside the 15m/1h bucket that opened at 14:00. The panel hands over
    // the base bar either way; snapping it onto whichever tier is displayed is the primitive's job.
    expect(currentZone(zonePrimitives)?.startTime).toBe(sec('2026-01-05T14:10:00.000Z'));
    expect(currentZone(zonePrimitives)?.startTime).not.toBe(sec('2026-01-05T14:00:00.000Z'));
  });
});

describe('TrainerOrderLevels stay inside the candle pane', () => {
  it('stops the hit band at the pane edge instead of spanning the whole overlay', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);

    // The chart element is 300 wide; the ~64px the price axis occupies is not the band's to take,
    // and drag-to-rescale there belongs to the axis.
    expect(hitBand('stop')!.style.left).toBe('0px');
    expect(hitBand('stop')!.style.width).toBe('236px');
  });

  it('drops a level whose price has scaled off the pane rather than drawing it below the pane', () => {
    const { handle, zonePrimitives } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    // y = 280 is past the 274px candle pane — on the real chart that is the MACD chart underneath.
    placeOrder(280, 175);

    // The stop is placed and still drives the plan; it is only its line that has nowhere to go.
    expect(currentZone(zonePrimitives)?.stop).toBe(20);
    expect(levelPill('entry')).toBeTruthy();
    expect(levelPill('target')).toBeTruthy();
    expect(levelPill('stop')).toBeNull();
    expect(hitBand('stop')).toBeNull();
  });
});

describe('TrainerOrderPanel quick market entry', () => {
  // The default fixture's revealed bars bottom at 98.50, so the structural stop is one tick under
  // it and the target is exactly twice that distance the other way.
  it('fills all three levels from one press, with no side picked and nothing drawn', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    fireEvent.click(screen.getByRole('button', { name: '市价做多' }));

    expect(screen.getByText('入场 100.00')).toBeTruthy();
    expect(screen.getByText('止损 98.49')).toBeTruthy();
    expect(screen.getByText('目标 103.03')).toBeTruthy();
    expect(screen.getByText(/盈亏比/).textContent).toContain('2.00 : 1');
  });

  it('leaves one click between the press and being in', async () => {
    const { handle } = makeHandle();
    const { bridge, submit } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    fireEvent.click(screen.getByRole('button', { name: '市价做多' }));
    hoverEntry();
    fireEvent.click(screen.getByRole('button', { name: '入场做多 1/2' }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const sent = submit.mock.calls[0][0] as {
      submission: TrainerSubmission;
      entryMode: string;
      size: number;
    };
    expect(sent.entryMode).toBe('market');
    expect(sent.size).toBe(0.5);
    expect(sent.submission.entry_plan).toEqual({ entry: 100, stop: 98.49, target1: 103.03 });
    expect(sent.submission.direction).toBe('long');
  });

  it('carries its own direction — 市价做空 needs no side picked first', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    fireEvent.click(screen.getByRole('button', { name: '市价做空' }));
    hoverEntry();

    expect(screen.getByRole('button', { name: '入场做空 1/2' })).toBeTruthy();
    expect(screen.getByText('入场 100.00')).toBeTruthy();
  });

  it('re-locks the size presets when the auto stop is dragged past the ratio floor', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    fireEvent.click(screen.getByRole('button', { name: '市价做多' }));
    hoverEntry();
    expect(
      (screen.getByRole('button', { name: '入场做多 1/2' }) as HTMLButtonElement).disabled,
    ).toBe(false);

    // Dragged to 97.00 (y=203) the risk becomes 3.00 while the auto target still sits 3.03 away,
    // which is 1.01 : 1 — under the floor the auto-filled pair was built to clear.
    dragBand('stop', 300 - 98.49, 203);

    expect(screen.getByText('止损 97.00')).toBeTruthy();
    expect(screen.getByText(/盈亏比/).textContent).toContain('1.01 : 1');
    for (const name of ['入场做多 全仓', '入场做多 1/2', '入场做多 1/4']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('asks for a hand-drawn stop when the revealed bars offer no structure below', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    const flat: RawBar[] = [
      { time: '2026-01-05T14:00:00.000Z', open: 100, high: 102, low: 100, close: 100, volume: 1 },
    ];
    renderPanel(makeView({ bars: { base: flat, mid: flat, top: flat } }), bridge, handle);

    fireEvent.click(screen.getByRole('button', { name: '市价做多' }));

    expect(screen.queryByText(/^止损 /)).toBeNull();
    expect(screen.getByText(/找不到能放止损的位置/)).toBeTruthy();
  });
});

describe('TrainerOrderPanel pointer arbitration with the drawing tools', () => {
  it('takes the TP/SL pulls off the ticket while a drawing tool owns the chart', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    const { rerender } = renderPanel(makeView(), bridge, handle);

    arm();
    hoverEntry();
    expect(screen.getByRole('button', { name: '拖出SL' })).toBeTruthy();

    rerender(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
        drawingActive
      />,
    );

    hoverEntry();
    expect(screen.queryByRole('button', { name: '拖出SL' })).toBeNull();
    expect(screen.queryByText(/^止损 /)).toBeNull();
  });

  // The band is full-pane-width and invisible, so leaving it attached while a tool is armed would
  // swallow the stroke the trader is trying to draw — and move the level instead.
  it('takes the stop/target hit bands off the chart while a drawing tool owns it', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    const { rerender } = renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    expect(screen.getByText('止损 90.00')).toBeTruthy();
    expect(hitBand('stop')).toBeTruthy();

    rerender(
      <TrainerOrderPanel
        view={makeView()}
        handle={handle}
        bridge={bridge}
        sessionId="run-1"
        onViewChange={() => {}}
        drawingActive
      />,
    );

    expect(hitBand('stop')).toBeNull();
    expect(hitBand('target')).toBeNull();

    // The pill is the other surface that used to start the same drag, so it has to be inert too.
    const stopPill = levelPill('stop')!;
    fireEvent.pointerDown(stopPill, { clientY: 210 });
    fireEvent.pointerMove(window, { clientY: 205 });
    fireEvent.pointerUp(window, { clientY: 205 });

    expect(screen.getByText('止损 90.00')).toBeTruthy();
  });

  it('keeps panning off while a drawing tool is active, and hands it back when it ends', () => {
    const { handle, chart } = makeHandle();
    const { bridge } = makeBridge();
    const { rerender } = renderPanel(makeView(), bridge, handle);
    expect(chart.applyOptions).not.toHaveBeenCalled();

    const withDrawing = (drawingActive: boolean) =>
      rerender(
        <TrainerOrderPanel
          view={makeView()}
          handle={handle}
          bridge={bridge}
          sessionId="run-1"
          onViewChange={() => {}}
          drawingActive={drawingActive}
        />,
      );

    withDrawing(true);
    expect(chart.applyOptions).toHaveBeenLastCalledWith({
      handleScroll: false,
      handleScale: false,
    });

    withDrawing(false);
    expect(chart.applyOptions).toHaveBeenLastCalledWith({ handleScroll: true, handleScale: true });
  });

  it('takes the chart back from the drawing tools on every direction press', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    const onTakeChart = vi.fn();
    renderPanel(makeView(), bridge, handle, { onTakeChart });

    fireEvent.click(screen.getByRole('button', { name: '做多' }));
    fireEvent.click(screen.getByRole('button', { name: '市价做空' }));

    expect(onTakeChart).toHaveBeenCalledTimes(2);
  });
});

describe('TrainerOrderLevels collapsed label and hit band', () => {
  it('collapses to the grip and the price until the label is pointed at', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    const entryPill = levelPill('entry')!;
    fireEvent.pointerLeave(entryPill);

    expect(screen.queryByRole('button', { name: '入场做多 全仓' })).toBeNull();
    expect(screen.queryByRole('button', { name: '撤销这个计划' })).toBeNull();
    expect(entryPill.textContent).toContain('100.00');
  });

  it('expands on hover, bringing back the size presets and the close button', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    const entryPill = levelPill('entry')!;
    fireEvent.pointerLeave(entryPill);
    expect(screen.queryByRole('button', { name: '入场做多 全仓' })).toBeNull();

    fireEvent.pointerEnter(entryPill);
    expect(screen.getByRole('button', { name: '入场做多 全仓' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '撤销这个计划' })).toBeTruthy();
  });

  it('expands on keyboard focus, and only collapses once focus leaves the whole label', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    const entryPill = levelPill('entry')!;
    fireEvent.pointerLeave(entryPill);
    expect(screen.queryByRole('button', { name: '入场做多 全仓' })).toBeNull();

    fireEvent.focus(entryPill);
    expect(screen.getByRole('button', { name: '入场做多 全仓' })).toBeTruthy();
    const dismissButton = screen.getByRole('button', { name: '撤销这个计划' });

    // Focus moving from the pill onto one of its own buttons (Tab forward into the region) must
    // not collapse it — only a relatedTarget outside the whole label means focus actually left.
    fireEvent.blur(entryPill, { relatedTarget: dismissButton });
    expect(screen.getByRole('button', { name: '入场做多 全仓' })).toBeTruthy();

    fireEvent.blur(entryPill, { relatedTarget: document.body });
    expect(screen.queryByRole('button', { name: '入场做多 全仓' })).toBeNull();
  });

  it('expands when the pointer enters the hit band, not only the pill', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    const stopHit = document.querySelector(
      '.trainer-level--stop .trainer-level-hit',
    ) as HTMLElement;
    const stopPill = levelPill('stop')!;
    expect(stopPill.querySelector('.trainer-level-text')).toBeNull();

    fireEvent.pointerEnter(stopHit);
    expect(stopPill.querySelector('.trainer-level-text')).toBeTruthy();

    fireEvent.pointerLeave(stopHit);
    expect(stopPill.querySelector('.trainer-level-text')).toBeNull();
  });

  it('keeps a label expanded through a drag started from the hit band, after the pointer leaves it', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    placeOrder(210, 175);
    const stopHit = document.querySelector(
      '.trainer-level--stop .trainer-level-hit',
    ) as HTMLElement;
    fireEvent.pointerDown(stopHit, { clientY: 210 });
    const stopPill = levelPill('stop')!;
    fireEvent.pointerLeave(stopPill);
    fireEvent.pointerMove(window, { clientY: 205 });

    expect(stopPill.textContent).toContain('95.00');
    expect(stopPill.querySelector('.trainer-level-text')).toBeTruthy();

    fireEvent.pointerUp(window, { clientY: 205 });
  });

  it('gives a hit band to a draggable level and withholds it from a non-draggable one', () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102);
    const { bridge } = makeAmendBridge(view);
    renderPanel(view, bridge, handle);

    expect(document.querySelector('.trainer-level--stop .trainer-level-hit')).toBeTruthy();
    expect(document.querySelector('.trainer-level--target .trainer-level-hit')).toBeTruthy();
    expect(document.querySelector('.trainer-level--entry .trainer-level-hit')).toBeNull();
  });

  it('offsets two levels closer than PILL_MIN_GAP_PX by the 80px lane step', () => {
    const { handle } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    // stop 97 (y=203) sits only 3px from entry's y=200, well under the 26px PILL_MIN_GAP_PX floor.
    placeOrder(203, 150);

    expect(levelPill('stop')?.style.marginRight).toBe('150px');
    expect(levelPill('entry')?.style.marginRight).toBe('70px');
  });
});

// TD-EXIT-01 allows trailing a stop to breakeven or better; nothing in TrainerOrderLevels may
// clamp a level at the entry line, since an open position's stop must be free to cross it.
describe('TrainerOrderLevels hit-band drag on an open position (TD-EXIT-01)', () => {
  it('lets a profitable long stop be dragged past its entry through the hit band, unclamped', () => {
    const { handle } = makeHandle();
    const view = makeOpenView('long', 102); // entry 100 / stop 99 / reference 102 (past 1R)
    const { bridge } = makeAmendBridge(view);
    renderPanel(view, bridge, handle);

    dragBand('stop', 199.5, 199.5); // price 100.5, above the 100 entry

    expect(levelPill('stop')?.textContent).toContain('100.50');
  });

  it('mirrors it for a profitable short', () => {
    const { handle } = makeHandle();
    const view = makeOpenView('short', 98); // entry 100 / stop 101 / reference 98 (past 1R)
    const { bridge } = makeAmendBridge(view);
    renderPanel(view, bridge, handle);

    dragBand('stop', 200.5, 200.5); // price 99.5, below the 100 entry

    expect(levelPill('stop')?.textContent).toContain('99.50');
  });
});

describe('TrainerOrderLevels drag price-axis line', () => {
  it('shows a price line on the axis while dragging, follows the pointer, and removes it on release', () => {
    const { handle, priceLines } = makeHandle();
    const { bridge } = makeBridge();
    renderPanel(makeView(), bridge, handle);

    arm();
    hoverEntry();
    fireEvent.pointerDown(screen.getByRole('button', { name: '拖出SL' }));
    expect(priceLines).toHaveLength(1);
    expect(priceLines[0].removed).toBe(false);

    fireEvent.pointerMove(window, { clientY: 210 });
    expect(priceLines[0].price).toBeCloseTo(90);

    fireEvent.pointerMove(window, { clientY: 205 });
    expect(priceLines[0].price).toBeCloseTo(95);
    expect(priceLines).toHaveLength(1);

    fireEvent.pointerUp(window, { clientY: 205 });
    expect(priceLines[0].removed).toBe(true);
  });

  it('removes the drag price line when the panel unmounts mid-drag', () => {
    const { handle, priceLines } = makeHandle();
    const { bridge } = makeBridge();
    const { unmount } = renderPanel(makeView(), bridge, handle);

    arm();
    hoverEntry();
    fireEvent.pointerDown(screen.getByRole('button', { name: '拖出SL' }));
    expect(priceLines).toHaveLength(1);
    expect(priceLines[0].removed).toBe(false);

    unmount();
    expect(priceLines[0].removed).toBe(true);
  });
});
