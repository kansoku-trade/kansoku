// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { IntradayBuilt, SymbolAnalysisRow } from '@kansoku/shared/types';

let previewState: {
  built: IntradayBuilt | null;
  error: string | null;
  degraded: boolean;
  intradayTf: null;
  setIntradayTf: () => void;
  predictionUpdatedAt: string | undefined;
  predictionStale: boolean | undefined;
};

vi.mock('@web/features/charts/intraday/useIntradayPreview', () => ({
  useIntradayPreview: () => previewState,
}));
vi.mock('@web/features/charts/intraday/useIntradayDoc', () => ({
  resolveIntradayTf: () => 'm5',
}));
vi.mock('./useCockpitEnv', () => ({
  useCockpitEnv: () => ({
    position: null,
    positionError: null,
    relvol: null,
    benchmark: null,
    benchmarkError: null,
  }),
}));
vi.mock('./useCockpitReviewState', () => ({
  useCockpitReviewState: () => ({
    journalEntries: [],
    reloadJournal: () => {},
    reviewSection: 'history',
    setReviewSection: () => {},
    selectedJournal: null,
    setSelectedJournal: () => {},
  }),
}));
vi.mock('./useCockpitComments', () => ({
  useCockpitComments: () => ({ comments: [], error: null, loaded: true }),
}));
vi.mock('./useAiUnreadBadge', () => ({
  useAiUnreadBadge: () => ({ unread: 0, latestAlert: null }),
}));
vi.mock('./sharedSidebarTabs', () => ({
  buildSharedSidebarTabs: () => [],
}));
vi.mock('./GenerateAnalysis', () => ({
  GenerateAnalysis: () => <div data-testid="generate-analysis" />,
}));
vi.mock('@web/features/charts/intraday/IntradayDashboard', () => ({
  IntradayDashboard: ({
    sidebarTabs,
    activeTab,
  }: {
    sidebarTabs: { key: string; content: ReactNode }[];
    activeTab: string;
  }) => <div>{sidebarTabs.find((t) => t.key === activeTab)?.content}</div>,
  IntradayTimeframeSwitch: () => null,
}));

const { PreviewCockpit } = await import('./PreviewCockpit');

afterEach(() => {
  cleanup();
});

const baseBuilt = {
  kind: 'intraday',
  sidebar: {
    prediction: null,
    entryPlan: null,
    technicals: {},
    context: null,
  },
  timeframes: {},
} as unknown as IntradayBuilt;

describe('PreviewCockpit prediction tab', () => {
  it('shows a CTA card when the symbol has no analyses at all', () => {
    previewState = {
      built: baseBuilt,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: () => {},
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    };

    render(
      <PreviewCockpit
        sym="MRVL.US"
        analysesRows={[]}
        onLive={() => {}}
        onSelectAnalysis={() => {}}
        liveQuote={null}
      />,
    );

    expect(screen.getByText('还没有 AI 分析')).toBeTruthy();
    expect(screen.getByText(/这只股票还没有分析报告/)).toBeTruthy();
    expect(screen.getByTestId('generate-analysis')).toBeTruthy();
  });

  it('keeps the live-view hint when analyses exist but the view is live', () => {
    previewState = {
      built: baseBuilt,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: () => {},
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    };

    render(
      <PreviewCockpit
        sym="MRVL.US"
        analysesRows={[
          {
            id: 'a1',
            schema_version: 1,
            type: 'intraday',
            title: 'a1',
            symbol: 'MRVL.US',
            created_at: '2026-07-21T09:30:00Z',
            updated_at: '2026-07-21T09:30:00Z',
            url: '/charts/a1',
            direction: null,
            anchor: null,
            outcome: null,
          } as SymbolAnalysisRow,
        ]}
        onLive={() => {}}
        onSelectAnalysis={() => {}}
        liveQuote={null}
      />,
    );

    expect(screen.getByText(/当前为实时视图/)).toBeTruthy();
    expect(screen.getByTestId('generate-analysis')).toBeTruthy();
  });

  it('renders PredictionTab content when the overlay carries a prediction', () => {
    previewState = {
      built: {
        ...baseBuilt,
        sidebar: {
          ...baseBuilt.sidebar,
          prediction: {
            direction: 'long',
            anchor: null,
            scenarios: [],
            signals: [],
            range_bound_plan: null,
          },
        },
      } as unknown as IntradayBuilt,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: () => {},
      predictionUpdatedAt: '2026-07-21T10:00:00Z',
      predictionStale: false,
    };

    render(
      <PreviewCockpit
        sym="MRVL.US"
        analysesRows={[]}
        onLive={() => {}}
        onSelectAnalysis={() => {}}
        liveQuote={null}
      />,
    );

    expect(screen.getByText('短线方向判断')).toBeTruthy();
    expect(screen.getByTestId('generate-analysis')).toBeTruthy();
  });
});
