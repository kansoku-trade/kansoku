// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { IntradayBuilt } from '@kansoku/shared/types';

let previewState: {
  built: IntradayBuilt | null;
  error: string | null;
  degraded: boolean;
  intradayTf: null;
  setIntradayTf: () => void;
  predictionUpdatedAt: string | undefined;
  predictionStale: boolean | undefined;
};

vi.mock('@web/charts/intraday/useIntradayPreview', () => ({
  useIntradayPreview: () => previewState,
}));
vi.mock('@web/charts/intraday/useIntradayDoc', () => ({
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
vi.mock('@web/charts/intraday/IntradayDashboard', () => ({
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
  it('shows the empty-state copy when there is no prediction', () => {
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

    expect(screen.getByText(/这只股票还没有 AI 分析/)).toBeTruthy();
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
