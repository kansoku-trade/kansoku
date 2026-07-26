// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerProvenance, TrainerReveal, TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';

const useDrawingsMock = vi.fn(() => ({}));

vi.mock('../charts/intraday/useIntradayCharts', () => ({
  EMA_COLORS: ['#fff'],
  useIntradayCharts: vi.fn(),
}));

vi.mock('../charts/drawings/useDrawings', () => ({
  useDrawings: useDrawingsMock,
}));

vi.mock('../charts/drawings/DrawingToolbar', () => ({
  DrawingToolbar: () => null,
}));

vi.mock('./payloadToIntradayBuilt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./payloadToIntradayBuilt')>();
  return { ...actual, buildTrainerIntradayBuilt: vi.fn(actual.buildTrainerIntradayBuilt) };
});

const { TrainerChart } = await import('./TrainerChart');
const { IntradayChartOnly } = await import('../charts/intraday/IntradayChartOnly');
const { IntradayControlsProvider } = await import('../charts/intraday/controlsContext');
const { buildTrainerIntradayBuilt } = await import('./payloadToIntradayBuilt');

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

function makeView(): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', 100), bar('2026-01-05T14:05:00.000Z', 101)];
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
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  useDrawingsMock.mockClear();
  vi.mocked(buildTrainerIntradayBuilt).mockClear();
});

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

function makeTerminalView(): TrainerView {
  return { ...makeView(), phase: 'terminal', terminal: true };
}

describe('TrainerChart', () => {
  it('calls useDrawings once the lazy chunk resolves, when drawings is enabled (control)', async () => {
    const built = buildTrainerIntradayBuilt(makeView());
    render(
      <IntradayControlsProvider>
        <IntradayChartOnly symbol="TRAIN01" built={built} activeTf="m5" />
      </IntradayControlsProvider>,
    );
    await waitFor(() => expect(useDrawingsMock).toHaveBeenCalled());
  });

  it('never calls the annotations/drawings hook, even after the lazy chunk would have resolved', async () => {
    render(<TrainerChart view={makeView()} />);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(useDrawingsMock).not.toHaveBeenCalled();
  });

  it('offers exactly the ladder tiers as period options', () => {
    render(<TrainerChart view={makeView()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['5m', '15m', '1h']);
  });

  it('switches the active tier when a ladder button is clicked', () => {
    render(<TrainerChart view={makeView()} />);
    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    expect(screen.getByRole('button', { name: '1h' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('renders no order panel when bridge/sessionId/onViewChange are omitted', () => {
    render(<TrainerChart view={makeView()} />);
    expect(screen.queryByLabelText('止损')).toBeNull();
  });

  it('renders the order panel once bridge/sessionId/onViewChange are supplied', () => {
    const bridge = { submit: vi.fn() } as unknown as Parameters<typeof TrainerChart>[0]['bridge'];
    render(
      <TrainerChart view={makeView()} bridge={bridge} sessionId="run-1" onViewChange={() => {}} />,
    );
    expect(screen.getByLabelText('止损')).toBeTruthy();
  });

  it('advances by the ladder tier currently selected in the period switch', () => {
    const step = vi.fn(async () => ({
      ok: true as const,
      data: { view: makeView(), events: [], advancedBars: 1, terminal: false, result: null },
    }));
    const bridge = { submit: vi.fn(), step } as unknown as Parameters<
      typeof TrainerChart
    >[0]['bridge'];
    render(
      <TrainerChart view={makeView()} bridge={bridge} sessionId="run-1" onViewChange={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    fireEvent.click(screen.getByRole('button', { name: /步进/ }));

    expect(step).toHaveBeenCalledWith({
      sessionId: 'run-1',
      action: { type: 'hold', bars: 1, period: '1h' },
    });
  });
});

describe('TrainerChart terminal state', () => {
  function makeRevealBridge(epilogue: RawBar[]): TrainerBridge {
    const reveal = vi.fn(async () => ({
      ok: true as const,
      data: { provenance: PROVENANCE, epilogue } satisfies TrainerReveal,
    }));
    return { reveal } as unknown as TrainerBridge;
  }

  it('renders the settlement pane instead of the advance/order panels once the view is terminal', () => {
    render(
      <TrainerChart
        view={makeTerminalView()}
        bridge={makeRevealBridge([])}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /步进/ })).toBeNull();
    expect(screen.queryByLabelText('止损')).toBeNull();
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('threads the revealed epilogue bars into the chart build only once the toggle is switched on', async () => {
    const epilogue = [bar('2026-01-05T14:10:00.000Z', 999)];
    render(
      <TrainerChart
        view={makeTerminalView()}
        bridge={makeRevealBridge(epilogue)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    await waitFor(() => {
      const lastCall = vi.mocked(buildTrainerIntradayBuilt).mock.calls.at(-1);
      expect(lastCall?.[1]).toBeFalsy();
    });

    fireEvent.click(await screen.findByRole('checkbox'));

    await waitFor(() => {
      const lastCall = vi.mocked(buildTrainerIntradayBuilt).mock.calls.at(-1);
      expect(lastCall?.[1]).toEqual(epilogue);
    });
  });

  it('clears a revealed epilogue once the view moves to a new case, so nothing post-cursor leaks onto the next blind chart', async () => {
    const epilogue = [bar('2026-01-05T14:10:00.000Z', 999)];
    const { rerender } = render(
      <TrainerChart
        view={makeTerminalView()}
        bridge={makeRevealBridge(epilogue)}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole('checkbox'));
    await waitFor(() => {
      const lastCall = vi.mocked(buildTrainerIntradayBuilt).mock.calls.at(-1);
      expect(lastCall?.[1]).toEqual(epilogue);
    });

    const nextCaseView: TrainerView = { ...makeView(), caseId: 'case-2' };
    rerender(
      <TrainerChart
        view={nextCaseView}
        bridge={makeRevealBridge([])}
        sessionId="run-1"
        onViewChange={() => {}}
      />,
    );

    await waitFor(() => {
      const lastCall = vi.mocked(buildTrainerIntradayBuilt).mock.calls.at(-1);
      expect(lastCall?.[0].caseId).toBe('case-2');
      expect(lastCall?.[1]).toBeFalsy();
    });
  });
});
