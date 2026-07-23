// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSpec } from '../../lib/ws/wsHub';

const subscribeChannel = vi.fn();

vi.mock('../../lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const store = await import('./analystRunsStore');
const { ReanalyzeStrip } = await import('./ReanalyzeStrip');

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
  unsub: ReturnType<typeof vi.fn>;
}

const running = (activity: string, extra: Record<string, unknown> = {}) => ({
  running: true as const,
  origin: 'manual' as const,
  phase: 'researching' as const,
  activity,
  startedAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  ...extra,
});

describe('ReanalyzeStrip', () => {
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

  it('renders nothing when there is no run active for the symbol', () => {
    const { container } = render(<ReanalyzeStrip sym="NVDA" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the reanalyzing label and current activity while running, collapsed by default', () => {
    const { container } = render(<ReanalyzeStrip sym="NVDA" />);
    push({
      type: 'update',
      symbol: 'NVDA',
      status: running('正在读取五分钟K线数据'),
    });

    expect(screen.getByText('AI 重新分析中…')).toBeTruthy();
    expect(screen.getByText('正在读取五分钟K线数据')).toBeTruthy();
    expect(container.querySelector('.analyst-run-feed')).toBeNull();
  });

  it('toggles the full AnalystRunFeed open and closed on click', () => {
    const { container } = render(<ReanalyzeStrip sym="NVDA" />);
    push({
      type: 'update',
      symbol: 'NVDA',
      status: running('正在读取五分钟K线数据'),
    });

    const toggle = container.querySelector('.reanalyze-strip-toggle');
    expect(toggle).toBeTruthy();

    fireEvent.click(toggle!);
    expect(container.querySelector('.analyst-run-feed')).toBeTruthy();

    fireEvent.click(toggle!);
    expect(container.querySelector('.analyst-run-feed')).toBeNull();
  });

  it('resets the collapse state when sym changes, even if the new symbol is also running', () => {
    const { container, rerender } = render(<ReanalyzeStrip sym="NVDA" />);
    push({
      type: 'update',
      symbol: 'NVDA',
      status: running('正在读取五分钟K线数据'),
    });

    fireEvent.click(container.querySelector('.reanalyze-strip-toggle')!);
    expect(container.querySelector('.analyst-run-feed')).toBeTruthy();

    push({
      type: 'update',
      symbol: 'AAPL',
      status: running('正在生成结论'),
    });
    rerender(<ReanalyzeStrip sym="AAPL" />);

    expect(container.querySelector('.analyst-run-feed')).toBeNull();
    expect(screen.getByText('AI 重新分析中…')).toBeTruthy();
  });
});
