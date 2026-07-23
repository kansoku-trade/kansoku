// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSpec } from '../../lib/ws/wsHub';

const subscribeChannel = vi.fn();

vi.mock('../../lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const store = await import('./analystRunsStore');
const { AnalystRunFeed } = await import('./AnalystRunFeed');

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
  unsub: ReturnType<typeof vi.fn>;
}

const SYM = 'NVDA';

const running = (activity: string, extra: Record<string, unknown> = {}) => ({
  running: true as const,
  origin: 'manual' as const,
  phase: 'researching' as const,
  activity,
  startedAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  ...extra,
});

describe('AnalystRunFeed', () => {
  let subs: Sub[];

  beforeEach(() => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation(
      (
        spec: ChannelSpec,
        onPayload: (payload: unknown) => void,
        onConnected: (connected: boolean) => void,
      ) => {
        const unsub = vi.fn();
        subs.push({ spec, onPayload, onConnected, unsub });
        return unsub;
      },
    );
  });

  afterEach(() => {
    cleanup();
    store.resetAnalystRunsStoreForTests();
  });

  function push(payload: unknown) {
    act(() => {
      subs[0].onPayload(payload);
    });
  }

  it('renders nothing when there is no running status and no lastEnded snapshot', () => {
    const { container } = render(<AnalystRunFeed sym={SYM} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows both card skeletons plus the activity feed while running with no sections yet', () => {
    const { container } = render(<AnalystRunFeed sym={SYM} />);
    push({
      type: 'update',
      symbol: SYM,
      status: running('正在生成结论', {
        activities: [
          { at: '2026-07-16T00:00:01.000Z', text: '开始收集资料' },
          { at: '2026-07-16T00:00:02.000Z', text: '读取五分钟K线数据' },
        ],
      }),
    });

    expect(container.querySelectorAll('.analyst-run-skeleton')).toHaveLength(2);
    expect(screen.getByText('正在生成结论')).toBeTruthy();
    const items = container.querySelectorAll('.analyst-run-feed-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('读取五分钟K线数据');
    expect(items[0].querySelector('.dot--pulse')).toBeTruthy();
    expect(items[1].textContent).toContain('开始收集资料');
    expect(items[1].querySelector('.dot--pulse')).toBeNull();
  });

  it('renders technical trend chips, levels and summary once the technical section arrives, while context stays skeleton', () => {
    const { container } = render(<AnalystRunFeed sym={SYM} />);
    push({
      type: 'update',
      symbol: SYM,
      status: running('正在生成结论', {
        sections: {
          technical: {
            trends: [
              { timeframe: 'm5', trend: 'up' },
              { timeframe: 'day', trend: 'sideways' },
            ],
            levels: [{ price: 123.45, label: '前高压力位' }],
            summary: '短线偏强，日线震荡',
          },
        },
      }),
    });

    expect(screen.getByText('5 分钟 · 向上')).toBeTruthy();
    expect(screen.getByText('日线 · 震荡')).toBeTruthy();
    expect(screen.getByText('前高压力位')).toBeTruthy();
    expect(screen.getByText('$123.45')).toBeTruthy();
    expect(screen.getByText('短线偏强，日线震荡')).toBeTruthy();
    expect(
      container.querySelector('.analyst-run-card--technical .analyst-run-skeleton'),
    ).toBeNull();
    expect(
      container.querySelector('.analyst-run-card--context .analyst-run-skeleton'),
    ).toBeTruthy();
  });

  it('fills both cards and shows the mid-read badge on each once both sections arrive', () => {
    render(<AnalystRunFeed sym={SYM} />);
    push({
      type: 'update',
      symbol: SYM,
      status: running('正在生成结论', {
        sections: {
          technical: {
            trends: [{ timeframe: 'h1', trend: 'down' }],
            levels: [],
            summary: '技术面转弱',
          },
          context: { summary: '消息面偏多，资金持续流入', bias: 'bullish' },
        },
      }),
    });

    expect(screen.getByText('技术面转弱')).toBeTruthy();
    expect(screen.getByText('利多')).toBeTruthy();
    expect(screen.getByText('消息面偏多，资金持续流入')).toBeTruthy();
    expect(screen.getAllByText('中间读数')).toHaveLength(2);
  });

  it('shows the incomplete banner and no pulsing dot once the run ends leaving a lastEnded snapshot', () => {
    const { container } = render(<AnalystRunFeed sym={SYM} />);
    push({
      type: 'update',
      symbol: SYM,
      status: running('正在生成结论', {
        activities: [{ at: '2026-07-16T00:00:01.000Z', text: '开始收集资料' }],
      }),
    });
    push({ type: 'update', symbol: SYM, status: { running: false } });

    expect(screen.getByText('分析未完成')).toBeTruthy();
    expect(screen.getByText('开始收集资料')).toBeTruthy();
    expect(container.querySelector('.dot--pulse')).toBeNull();
  });

  it('orders activities newest-first and caps the visible feed at 8 entries', () => {
    const { container } = render(<AnalystRunFeed sym={SYM} />);
    const activities = Array.from({ length: 10 }, (_, i) => ({
      at: `2026-07-16T00:00:${String(i).padStart(2, '0')}.000Z`,
      text: `动态第${i + 1}条`,
    }));
    push({
      type: 'update',
      symbol: SYM,
      status: running('正在生成结论', { activities }),
    });

    const items = container.querySelectorAll('.analyst-run-feed-item');
    expect(items).toHaveLength(8);
    expect(items[0].textContent).toContain('动态第10条');
    expect(items[7].textContent).toContain('动态第3条');
    expect(screen.queryByText('动态第1条')).toBeNull();
    expect(screen.queryByText('动态第2条')).toBeNull();
  });
});
