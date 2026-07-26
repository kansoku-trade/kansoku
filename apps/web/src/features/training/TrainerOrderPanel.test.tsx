// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerSubmission, TrainerView } from '@kansoku/pro-api';
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
