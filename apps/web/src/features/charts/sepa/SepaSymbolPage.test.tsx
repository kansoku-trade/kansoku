// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartMeta, SepaBuilt } from '@kansoku/shared/types';
import type { ChartDocView } from '@web/features/charts/intraday/useIntradayDoc';

const useIntradayDocMock = vi.fn();
const chartsListMock = vi.fn();

vi.mock('../intraday/useIntradayDoc', () => ({
  useIntradayDoc: (id: string | null) => useIntradayDocMock(id),
}));

vi.mock('@web/features/quotes/useLiveQuote', () => ({
  useLiveQuote: () => null,
}));

vi.mock('@web/lib/client', () => ({
  client: { charts: { list: (...args: unknown[]) => chartsListMock(...args) } },
}));

vi.mock('./SepaCockpit', () => ({
  SepaCockpit: ({ sym, doc }: { sym: string; doc: { id: string } }) => (
    <div data-testid="sepa-cockpit">
      {sym}:{doc.id}
    </div>
  ),
}));

const { SepaSymbolPage } = await import('./SepaSymbolPage');

function sepaDoc(id: string): ChartDocView & { built: SepaBuilt } {
  return {
    id,
    schema_version: 2,
    type: 'sepa',
    title: 'MRVL',
    symbol: 'MRVL.US',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    input: { origin: 'research' },
    built: { kind: 'sepa' } as SepaBuilt,
  } as ChartDocView & { built: SepaBuilt };
}

function chartMeta(id: string): ChartMeta {
  return {
    id,
    schema_version: 2,
    type: 'sepa',
    title: 'MRVL',
    symbol: 'MRVL.US',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
  };
}

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  useIntradayDocMock.mockReset();
  chartsListMock.mockReset();
});

describe('SepaSymbolPage: pinned analysis (?analysis=<id>)', () => {
  it('loads the pinned doc via the existing doc hook and renders SepaCockpit', () => {
    useIntradayDocMock.mockReturnValue({
      doc: sepaDoc('chart-1'),
      error: null,
      reload: vi.fn(),
    });

    renderWithClient(<SepaSymbolPage sym="MRVL.US" analysisId="chart-1" />);

    expect(useIntradayDocMock).toHaveBeenCalledWith('chart-1');
    expect(screen.getByTestId('sepa-cockpit').textContent).toBe('MRVL.US:chart-1');
  });

  it('shows an ErrorBox linking to the cockpit route when the pinned doc is not a SEPA chart', () => {
    useIntradayDocMock.mockReturnValue({
      doc: { ...sepaDoc('chart-1'), built: { kind: 'intraday' } },
      error: null,
      reload: vi.fn(),
    });

    renderWithClient(<SepaSymbolPage sym="MRVL.US" analysisId="chart-1" />);

    expect(screen.getByText('这份分析不是 SEPA 仪表盘。')).toBeTruthy();
    const link = screen.getByText('去驾驶舱查看');
    expect(link.getAttribute('href')).toBe('/symbol/MRVL.US?analysis=chart-1');
    expect(screen.queryByTestId('sepa-cockpit')).toBeNull();
  });
});

describe('SepaSymbolPage: latest-resolution (no ?analysis=)', () => {
  it('resolves the newest sepa chart via charts.list and renders SepaCockpit', async () => {
    chartsListMock.mockResolvedValue([chartMeta('chart-9'), chartMeta('chart-8')]);
    useIntradayDocMock.mockImplementation((id: string | null) => ({
      doc: id === 'chart-9' ? sepaDoc('chart-9') : null,
      error: null,
      reload: vi.fn(),
    }));

    renderWithClient(<SepaSymbolPage sym="MRVL.US" analysisId={null} />);

    await waitFor(() =>
      expect(chartsListMock).toHaveBeenCalledWith({ type: 'sepa', symbol: 'MRVL.US' }),
    );
    await waitFor(() => expect(screen.getByTestId('sepa-cockpit').textContent).toBe('MRVL.US:chart-9'));
  });

  it('shows an empty state linking back to the cockpit when no sepa chart exists', async () => {
    chartsListMock.mockResolvedValue([]);
    useIntradayDocMock.mockReturnValue({ doc: null, error: null, reload: vi.fn() });

    renderWithClient(<SepaSymbolPage sym="MRVL.US" analysisId={null} />);

    expect(await screen.findByText('这只股票还没有 SEPA 仪表盘')).toBeTruthy();
    const link = screen.getByText('返回驾驶舱');
    expect(link.closest('a')?.getAttribute('href')).toBe('/symbol/MRVL.US');
    expect(screen.queryByTestId('sepa-cockpit')).toBeNull();
  });
});
