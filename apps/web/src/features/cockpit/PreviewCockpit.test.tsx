// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { IntradayBuilt, SymbolAnalysisRow } from '@kansoku/shared/types';
import type { AnalystRunLastEnded, RunningReassessStatus } from './analystRunsStore';

let previewState: {
  built: IntradayBuilt | null;
  error: string | null;
  degraded: boolean;
  intradayTf: null;
  setIntradayTf: () => void;
  predictionUpdatedAt: string | undefined;
  predictionStale: boolean | undefined;
};

let analystRunStatus: RunningReassessStatus | null = null;
let analystRunLastEnded: AnalystRunLastEnded | null = null;
let capturedBuilt: IntradayBuilt | null = null;

vi.mock('@web/features/charts/intraday/useIntradayPreview', () => ({
  useIntradayPreview: () => previewState,
}));
vi.mock('./analystRunsStore', () => ({
  useAnalystRunStatus: () => analystRunStatus,
  useAnalystRunLastEnded: () => analystRunLastEnded,
}));
vi.mock('./AnalystRunFeed', () => ({
  AnalystRunFeed: () => <div data-testid="analyst-run-feed" />,
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
    built,
    sidebarTabs,
    activeTab,
  }: {
    built: IntradayBuilt;
    sidebarTabs: { key: string; content: ReactNode }[];
    activeTab: string;
  }) => {
    capturedBuilt = built;
    return <div>{sidebarTabs.find((t) => t.key === activeTab)?.content}</div>;
  },
  IntradayTimeframeSwitch: () => null,
}));

const { PreviewCockpit } = await import('./PreviewCockpit');

afterEach(() => {
  cleanup();
  analystRunStatus = null;
  analystRunLastEnded = null;
  capturedBuilt = null;
});

const technicalLevels = [
  { price: 101.5, label: '阻力' },
  { price: 98.2, label: '支撑' },
];

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

  it('renders AnalystRunFeed instead of the CTA when a run is active for the symbol', () => {
    previewState = {
      built: baseBuilt,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: () => {},
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    };
    analystRunStatus = {
      running: true,
      origin: 'manual',
      phase: 'researching',
      activity: '正在读取五分钟K线数据',
      startedAt: '2026-07-21T09:00:00Z',
      updatedAt: '2026-07-21T09:00:00Z',
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

    expect(screen.getByTestId('analyst-run-feed')).toBeTruthy();
    expect(screen.queryByTestId('generate-analysis')).toBeNull();
    expect(screen.queryByText('还没有 AI 分析')).toBeNull();
  });

  it('renders AnalystRunFeed plus a retry entry point when a lastEnded snapshot exists and no run is active', () => {
    previewState = {
      built: baseBuilt,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: () => {},
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    };
    analystRunLastEnded = {
      activities: [{ at: '2026-07-21T09:05:00Z', text: '开始收集资料' }],
      sections: {},
      startedAt: '2026-07-21T09:00:00Z',
      endedAt: '2026-07-21T09:06:00Z',
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

    expect(screen.getByTestId('analyst-run-feed')).toBeTruthy();
    expect(screen.getByTestId('generate-analysis')).toBeTruthy();
  });

  it('prefers AnalystRunFeed over the live-view Empty when a run is active and analyses already exist', () => {
    previewState = {
      built: baseBuilt,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: () => {},
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    };
    analystRunStatus = {
      running: true,
      origin: 'manual',
      phase: 'researching',
      activity: '正在读取五分钟K线数据',
      startedAt: '2026-07-21T09:00:00Z',
      updatedAt: '2026-07-21T09:00:00Z',
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

    expect(screen.getByTestId('analyst-run-feed')).toBeTruthy();
    expect(screen.queryByText(/当前为实时视图/)).toBeNull();
  });

  it('prefers the lastEnded feed over the live-view Empty when analyses already exist and no run is active', () => {
    previewState = {
      built: baseBuilt,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: () => {},
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    };
    analystRunLastEnded = {
      activities: [{ at: '2026-07-21T09:05:00Z', text: '开始收集资料' }],
      sections: {},
      startedAt: '2026-07-21T09:35:00Z',
      endedAt: '2026-07-21T09:36:00Z',
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

    expect(screen.getByTestId('analyst-run-feed')).toBeTruthy();
    expect(screen.getByTestId('generate-analysis')).toBeTruthy();
    expect(screen.queryByText(/当前为实时视图/)).toBeNull();
  });

  it('falls through to the live-view Empty when an analysis row is newer than the lastEnded startedAt', () => {
    previewState = {
      built: baseBuilt,
      error: null,
      degraded: false,
      intradayTf: null,
      setIntradayTf: () => {},
      predictionUpdatedAt: undefined,
      predictionStale: undefined,
    };
    analystRunLastEnded = {
      activities: [{ at: '2026-07-21T09:05:00Z', text: '开始收集资料' }],
      sections: {},
      startedAt: '2026-07-21T09:00:00Z',
      endedAt: '2026-07-21T09:06:00Z',
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

    expect(screen.queryByTestId('analyst-run-feed')).toBeNull();
    expect(screen.getByText(/当前为实时视图/)).toBeTruthy();
    expect(screen.getByTestId('generate-analysis')).toBeTruthy();
  });
});

describe('PreviewCockpit preview levels overlay', () => {
  const runningWithLevels: RunningReassessStatus = {
    running: true,
    origin: 'manual',
    phase: 'writing',
    activity: '正在整理关键位',
    startedAt: '2026-07-21T09:00:00Z',
    updatedAt: '2026-07-21T09:00:00Z',
    sections: { technical: { trends: [], levels: technicalLevels, summary: '' } },
  };

  const renderWith = (built: IntradayBuilt) => {
    previewState = {
      built,
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
  };

  it('grafts a running run technical levels onto the chart built', () => {
    analystRunStatus = runningWithLevels;

    renderWith(baseBuilt);

    expect(capturedBuilt?.previewLevels).toEqual(technicalLevels);
  });

  it('grafts a lastEnded snapshot technical levels when no run is active', () => {
    analystRunLastEnded = {
      activities: [],
      sections: { technical: { trends: [], levels: technicalLevels, summary: '' } },
      startedAt: '2026-07-21T09:00:00Z',
      endedAt: '2026-07-21T09:06:00Z',
    };

    renderWith(baseBuilt);

    expect(capturedBuilt?.previewLevels).toEqual(technicalLevels);
  });

  it('leaves the built free of preview levels when nothing carries them', () => {
    renderWith(baseBuilt);

    expect(capturedBuilt?.previewLevels).toBeUndefined();
  });

  it('suppresses preview levels once a real prediction is on the chart', () => {
    analystRunStatus = runningWithLevels;

    renderWith({
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
    } as unknown as IntradayBuilt);

    expect(capturedBuilt?.previewLevels).toBeUndefined();
  });
});
