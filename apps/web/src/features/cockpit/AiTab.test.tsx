// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CockpitComment } from '@kansoku/shared/types';

interface QueryResult {
  data: unknown;
  error: string | null;
  loading: boolean;
}

let queryImpl: (key: string | null) => QueryResult = () => ({
  data: null,
  error: null,
  loading: false,
});

vi.mock('@web/lib/client', () => ({
  client: {
    symbols: {
      commentDates: vi.fn(),
      comments: vi.fn(),
    },
  },
}));
vi.mock('@web/lib/apiHooks', () => ({
  useQuery: (key: string | null) => queryImpl(key),
}));
vi.mock('./useAnalystRun', () => ({
  useAnalystRun: () => ({
    hint: null,
    pending: false,
    running: false,
    start: vi.fn(),
    status: null,
  }),
}));
vi.mock('./AliveLine', () => ({
  AliveLine: ({ symbol }: { symbol: string }) => <div data-testid="alive-line">{symbol}</div>,
}));
vi.mock('./ExplainAction', () => ({
  ExplainAction: ({ symbol }: { symbol: string }) => (
    <button data-testid="explain-action">{symbol}</button>
  ),
}));
vi.mock('./FollowAction', () => ({
  FollowAction: () => <div data-testid="follow-action" />,
}));

const { AiTab } = await import('./AiTab');

const liveComments: CockpitComment[] = [
  { ts: '2026-07-24T14:00:00.000Z', symbol: 'MU.US', level: 'info', text: '今天有点评', source: 'analyst' },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  queryImpl = () => ({ data: null, error: null, loading: false });
});

describe('AiTab header wiring', () => {
  it('renders the explain CTA beside 重新分析 and shows the alive line for the live today view', () => {
    queryImpl = (key) => {
      if (key?.startsWith('symbols.commentDates')) return { data: [], error: null, loading: false };
      return { data: null, error: null, loading: false };
    };

    render(
      <AiTab symbol="MU.US" comments={liveComments} error={null} loaded analysisRevision="rev1" />,
    );

    expect(screen.getByText('重新分析')).toBeTruthy();
    expect(screen.getByTestId('explain-action').textContent).toBe('MU.US');
    expect(screen.getByTestId('alive-line').textContent).toBe('MU.US');
  });

  it('hides the explain CTA and the alive line in read-only mode', () => {
    render(<AiTab symbol="MU.US" comments={[]} error={null} readOnly loaded />);

    expect(screen.queryByText('重新分析')).toBeNull();
    expect(screen.queryByTestId('explain-action')).toBeNull();
    expect(screen.queryByTestId('alive-line')).toBeNull();
  });

  it('hides the alive line once the view falls back to a past date', () => {
    queryImpl = (key) => {
      if (key?.startsWith('symbols.commentDates')) {
        return { data: ['2000-01-01'], error: null, loading: false };
      }
      if (key?.startsWith('symbols.comments:MU.US:2000-01-01')) {
        return { data: [], error: null, loading: false };
      }
      return { data: null, error: null, loading: false };
    };

    render(<AiTab symbol="MU.US" comments={[]} error={null} loaded analysisRevision="rev1" />);

    expect(screen.getByText('显示 2000-01-01 的点评（今天暂无新点评）')).toBeTruthy();
    expect(screen.queryByTestId('alive-line')).toBeNull();
  });

  it('clusters follow and the date picker so they wrap as one unit', () => {
    queryImpl = (key) => {
      if (key?.startsWith('symbols.commentDates')) {
        return { data: ['2000-01-01'], error: null, loading: false };
      }
      return { data: null, error: null, loading: false };
    };

    const { container } = render(
      <AiTab symbol="MU.US" comments={liveComments} error={null} loaded analysisRevision="rev1" />,
    );

    const follow = screen.getByTestId('follow-action');
    const date = container.querySelector('.ai-date-select');
    const cluster = container.querySelector('.ai-toolbar-end');
    expect(date).toBeTruthy();
    expect(cluster).toBeTruthy();
    expect(cluster?.contains(follow)).toBe(true);
    expect(cluster?.contains(date)).toBe(true);
    expect(cluster?.querySelector('.btn')).toBeNull();
  });
});
