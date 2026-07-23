// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SepaBuilt } from '@kansoku/shared/types';
import type { ChartDocView } from '@web/features/charts/intraday/useIntradayDoc';
import type { SepaRefreshController } from '@web/features/cockpit/useSepaRefresh';

type SepaDocView = ChartDocView & { built: SepaBuilt };

const useSepaRefresh = vi.fn();

vi.mock('@web/features/cockpit/useSepaRefresh', () => ({
  useSepaRefresh: (...args: unknown[]) => useSepaRefresh(...args),
}));

vi.mock('./SepaDashboard', () => ({
  SepaDashboard: () => <div data-testid="sepa-dashboard" />,
}));

const { SepaCockpit } = await import('./SepaCockpit');

function sepaDoc(overrides: Partial<ChartDocView> = {}): SepaDocView {
  return {
    id: 'chart-1',
    schema_version: 2,
    type: 'sepa',
    title: 'MRVL',
    symbol: 'MRVL.US',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    input: { origin: 'research' },
    built: { kind: 'sepa', sidebar: { asOf: '2026-07-20T00:00:00.000Z' } } as SepaBuilt,
    ...overrides,
  } as SepaDocView;
}

function refreshController(overrides: Partial<SepaRefreshController> = {}): SepaRefreshController {
  return { refreshing: false, error: null, refresh: vi.fn(), ...overrides };
}

afterEach(() => {
  cleanup();
  useSepaRefresh.mockReset();
});

describe('SepaCockpit', () => {
  it('shows the manual refresh button for a research-origin doc', () => {
    useSepaRefresh.mockReturnValue(refreshController());
    const reload = vi.fn();

    render(
      <SepaCockpit sym="MRVL.US" doc={sepaDoc()} reload={reload} liveQuote={null} />,
    );

    expect(screen.getByText('更新数据')).toBeTruthy();
    expect(screen.getByTestId('sepa-dashboard')).toBeTruthy();
  });

  it('hides the refresh button for a non-research-origin doc', () => {
    useSepaRefresh.mockReturnValue(refreshController());

    render(
      <SepaCockpit
        sym="MRVL.US"
        doc={sepaDoc({ input: {} })}
        reload={vi.fn()}
        liveQuote={null}
      />,
    );

    expect(screen.queryByText('更新数据')).toBeNull();
  });

  it('shows a spinner hint while refreshing', () => {
    useSepaRefresh.mockReturnValue(refreshController({ refreshing: true }));

    render(<SepaCockpit sym="MRVL.US" doc={sepaDoc()} reload={vi.fn()} liveQuote={null} />);

    expect(screen.getByText('正在更新到最新数据…')).toBeTruthy();
  });

  it('shows the stale-data hint once the refresh fails', () => {
    useSepaRefresh.mockReturnValue(refreshController({ error: 'network down' }));

    render(<SepaCockpit sym="MRVL.US" doc={sepaDoc()} reload={vi.fn()} liveQuote={null} />);

    expect(screen.getByText('更新失败，展示的是 2026-07-20 的数据')).toBeTruthy();
  });

  it('invokes refresh() when the manual button is clicked', () => {
    const refresh = vi.fn();
    useSepaRefresh.mockReturnValue(refreshController({ refresh }));

    render(<SepaCockpit sym="MRVL.US" doc={sepaDoc()} reload={vi.fn()} liveQuote={null} />);
    fireEvent.click(screen.getByText('更新数据'));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('wires the doc and reload callback into useSepaRefresh', () => {
    useSepaRefresh.mockReturnValue(refreshController());
    const reload = vi.fn();
    const doc = sepaDoc();

    render(<SepaCockpit sym="MRVL.US" doc={doc} reload={reload} liveQuote={null} />);

    expect(useSepaRefresh).toHaveBeenCalledWith(doc, reload);
  });
});
