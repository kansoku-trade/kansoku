// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIntradayPreview } from './intraday/useIntradayPreview';
import { PopoutChartWindow } from './PopoutChartWindow';

vi.mock('../quotes/useLiveQuote', () => ({
  useLiveQuote: () => ({ symbol: 'NVDA.US', last: 123.45, pct: 1.2, session: '日盘', asOf: '' }),
}));

vi.mock('./intraday/useIntradayPreview', () => ({ useIntradayPreview: vi.fn() }));

vi.mock('./intraday/useIntradayDoc', () => ({
  resolveIntradayTf: () => 'm15',
}));

vi.mock('./intraday/IntradayDashboard', () => ({
  IntradayChartOnly: ({ symbol }: { symbol: string }) => (
    <div data-testid="popout-chart">chart:{symbol}</div>
  ),
}));

const mockedUseIntradayPreview = vi.mocked(useIntradayPreview);

afterEach(() => {
  cleanup();
  mockedUseIntradayPreview.mockReset();
});

describe('PopoutChartWindow', () => {
  it('renders a slim header (symbol + live quote) and the chart, with no tab bar or global navigation', () => {
    mockedUseIntradayPreview.mockReturnValue({
      built: { sidebar: {}, timeframes: {}, defaultTf: 'm15' } as unknown as ReturnType<
        typeof mockedUseIntradayPreview
      >['built'],
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: vi.fn(),
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    });

    const { container } = render(<PopoutChartWindow sym="NVDA" />);

    expect(screen.getByText('NVDA')).toBeTruthy();
    expect(screen.getByText('$123.45')).toBeTruthy();
    expect(screen.getByTestId('popout-chart').textContent).toBe('chart:NVDA');

    expect(container.querySelector('.desktop-titlebar')).toBeNull();
    expect(container.querySelector('.desktop-tabstrip')).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('.sidebar')).toBeNull();
  });

  it('shows an empty state instead of the chart before the live preview arrives', () => {
    mockedUseIntradayPreview.mockReturnValue({
      built: null,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: vi.fn(),
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    });

    render(<PopoutChartWindow sym="NVDA" />);

    expect(screen.getByText('加载中…')).toBeTruthy();
    expect(screen.queryByTestId('popout-chart')).toBeNull();
  });

  it('shows the error box when the preview channel reports an error', () => {
    mockedUseIntradayPreview.mockReturnValue({
      built: null,
      error: '行情连接失败',
      degraded: false,
      intradayTf: null,
      setIntradayTf: vi.fn(),
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    });

    render(<PopoutChartWindow sym="NVDA" />);

    expect(screen.getByText('行情连接失败')).toBeTruthy();
  });
});
