// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventSourceStatus } from '@kansoku/core/contract/events';
import { EventSourceHealth } from './EventSourceHealth';

afterEach(() => cleanup());

function status(over: Partial<EventSourceStatus> = {}): EventSourceStatus {
  return {
    source: 'sec-edgar',
    health: 'active',
    cursor: null,
    failureStreak: 0,
    lastPolledAt: '2026-08-01T14:30:00.000Z',
    lastEventAt: '2026-08-01T14:00:00.000Z',
    lastError: null,
    disabledReason: null,
    nextAttemptAt: null,
    updatedAt: '2026-08-01T14:30:00.000Z',
    ...over,
  };
}

describe('EventSourceHealth', () => {
  it('reports last poll and last event as two separate facts for a live source', () => {
    render(<EventSourceHealth sources={[status()]} error={null} loading={false} />);
    expect(screen.getByText('SEC')).toBeTruthy();
    expect(screen.getByText('运行中')).toBeTruthy();
    expect(screen.getByText(/最近轮询/)).toBeTruthy();
    expect(screen.getByText(/最近事件/)).toBeTruthy();
  });

  it('says a quiet source has produced nothing instead of calling it healthy', () => {
    render(<EventSourceHealth sources={[status({ lastEventAt: null })]} error={null} loading={false} />);
    expect(screen.getByText(/最近事件 尚无/)).toBeTruthy();
  });

  it('says a never-polled source has not run yet', () => {
    render(
      <EventSourceHealth
        sources={[status({ lastPolledAt: null, lastEventAt: null })]}
        error={null}
        loading={false}
      />,
    );
    expect(screen.getByText(/最近轮询 尚未开始/)).toBeTruthy();
  });

  it('separates a switched-off source from a failing one in wording and styling', () => {
    render(
      <EventSourceHealth
        sources={[
          status({
            source: 'longbridge-news',
            health: 'disabled',
            lastPolledAt: null,
            lastEventAt: null,
            disabledReason: '缺少长桥凭据',
          }),
          status({
            source: 'bls-rss',
            health: 'degraded',
            failureStreak: 3,
            lastError: 'HTTP 503',
            nextAttemptAt: '2026-08-01T14:35:00.000Z',
          }),
        ]}
        error={null}
        loading={false}
      />,
    );

    const off = screen.getByText('已关闭');
    const failing = screen.getByText('异常');
    expect(off.className).not.toBe(failing.className);
    expect(screen.getByText('缺少长桥凭据')).toBeTruthy();
    expect(screen.getByText('HTTP 503')).toBeTruthy();
    expect(screen.getByText(/连续失败 3 次/)).toBeTruthy();
    expect(screen.getByText(/下次重试/)).toBeTruthy();
  });

  it('names a switched-off source without a stated reason rather than leaving it blank', () => {
    render(
      <EventSourceHealth
        sources={[status({ health: 'disabled', disabledReason: null })]}
        error={null}
        loading={false}
      />,
    );
    expect(screen.getByText('未说明关闭原因')).toBeTruthy();
  });

  it('shows loading, empty and failure states distinctly', () => {
    const { rerender } = render(<EventSourceHealth sources={null} error={null} loading />);
    expect(screen.getByText('来源状态加载中…')).toBeTruthy();

    rerender(<EventSourceHealth sources={[]} error={null} loading={false} />);
    expect(screen.getByText('还没有登记任何事件来源')).toBeTruthy();

    rerender(<EventSourceHealth sources={null} error="boom" loading={false} />);
    expect(screen.getByText(/来源状态获取失败/)).toBeTruthy();
  });

  it('gives the summary an accessible name and counts sources by state', () => {
    render(
      <EventSourceHealth
        sources={[status(), status({ source: 'bls-rss', health: 'degraded', lastError: 'x' })]}
        error={null}
        loading={false}
      />,
    );
    expect(screen.getByRole('group', { name: '事件来源状态' })).toBeTruthy();
    expect(screen.getByText('1 运行 · 1 异常 · 0 关闭')).toBeTruthy();
  });
});
