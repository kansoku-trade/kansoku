// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import { formatObservedDelay, MarketEventCard } from './MarketEventCard';

afterEach(() => cleanup());

const base: MarketEvent = {
  id: 'evt-1',
  dedupeKey: 'sec:MU:8-K:1',
  clusterId: 'cluster-1',
  source: 'sec-edgar',
  class: 'filing',
  kind: '8-K',
  symbols: ['MU.US', 'NVDA.US'],
  occurredAt: '2026-08-01T14:30:00.000Z',
  observedAt: '2026-08-01T14:33:00.000Z',
  trust: 'official',
  severity: 'critical',
  payload: {
    title: 'Micron 提交 8-K',
    summary: '公司披露一份新的供货协议',
    url: 'https://www.sec.gov/filing/1',
  },
  canvasSlug: null,
};

describe('formatObservedDelay', () => {
  it('reads seconds, minutes, hours and days off the two clocks', () => {
    expect(formatObservedDelay('2026-08-01T10:00:00.000Z', '2026-08-01T10:00:20.000Z')).toBe(
      '20 秒',
    );
    expect(formatObservedDelay('2026-08-01T10:00:00.000Z', '2026-08-01T10:03:00.000Z')).toBe(
      '3 分钟',
    );
    expect(formatObservedDelay('2026-08-01T10:00:00.000Z', '2026-08-01T12:30:00.000Z')).toBe(
      '2.5 小时',
    );
    expect(formatObservedDelay('2026-08-01T10:00:00.000Z', '2026-08-03T10:00:00.000Z')).toBe(
      '2 天',
    );
  });

  it('returns null when the observation is not later than the event', () => {
    expect(formatObservedDelay('2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z')).toBeNull();
    expect(formatObservedDelay('2026-08-01T10:00:00.000Z', 'not-a-time')).toBeNull();
  });
});

describe('MarketEventCard', () => {
  it('shows the headline, summary, source, trust, severity and class', () => {
    render(<MarketEventCard event={base} />);
    expect(screen.getByText('Micron 提交 8-K')).toBeTruthy();
    expect(screen.getByText('公司披露一份新的供货协议')).toBeTruthy();
    expect(screen.getByText('SEC')).toBeTruthy();
    expect(screen.getByText('官方')).toBeTruthy();
    expect(screen.getByText('重大')).toBeTruthy();
    expect(screen.getByText('备案')).toBeTruthy();
  });

  it('shows when the event happened and how late we saw it', () => {
    render(<MarketEventCard event={base} />);
    expect(screen.getByText('08-01 10:30')).toBeTruthy();
    expect(screen.getByText(/慢 3 分钟/)).toBeTruthy();
  });

  it('links every related symbol to its cockpit', () => {
    render(<MarketEventCard event={base} />);
    const mu = screen.getByRole('link', { name: 'MU' });
    expect(mu.getAttribute('href')).toBe('/symbol/MU.US');
    expect(screen.getByRole('link', { name: 'NVDA' })).toBeTruthy();
  });

  it('offers the original source as a real link, and omits it when there is none', () => {
    const { unmount } = render(<MarketEventCard event={base} />);
    const link = screen.getByRole('link', { name: '打开原文：Micron 提交 8-K' });
    expect(link.getAttribute('href')).toBe('https://www.sec.gov/filing/1');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    unmount();

    render(<MarketEventCard event={{ ...base, payload: { title: 'Micron 提交 8-K' } }} />);
    expect(screen.queryByRole('link', { name: /打开原文/ })).toBeNull();
  });

  it('hands the event to the canvas generation callback', () => {
    const onGenerateCanvas = vi.fn();
    render(<MarketEventCard event={base} onGenerateCanvas={onGenerateCanvas} />);
    const action = screen.getByRole('button', { name: '生成事件画布：Micron 提交 8-K' });
    expect(action.tagName).toBe('BUTTON');
    fireEvent.click(action);
    expect(onGenerateCanvas).toHaveBeenCalledWith(base);
  });

  it('keeps the canvas action in place but disabled until a handler is wired', () => {
    render(<MarketEventCard event={base} />);
    const action = screen.getByRole('button', { name: '生成事件画布：Micron 提交 8-K' });
    expect((action as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens an existing canvas instead of generating again', () => {
    const onOpenCanvas = vi.fn();
    const onGenerateCanvas = vi.fn();
    render(
      <MarketEventCard
        event={{ ...base, canvasSlug: 'event-evt-1' }}
        onGenerateCanvas={onGenerateCanvas}
        onOpenCanvas={onOpenCanvas}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '打开事件画布：Micron 提交 8-K' }));
    expect(onOpenCanvas).toHaveBeenCalledWith('event-evt-1');
    expect(onGenerateCanvas).not.toHaveBeenCalled();
  });

  it('disables the control while a generation is running', () => {
    render(
      <MarketEventCard
        event={base}
        canvasPhase="running"
        onGenerateCanvas={() => {}}
      />,
    );
    const action = screen.getByRole('button', { name: '正在生成事件画布：Micron 提交 8-K' });
    expect((action as HTMLButtonElement).disabled).toBe(true);
    expect(action.textContent).toContain('生成中');
  });

  it('offers a retry after a failed generation', () => {
    const onGenerateCanvas = vi.fn();
    render(
      <MarketEventCard event={base} canvasPhase="failed" onGenerateCanvas={onGenerateCanvas} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '重试生成事件画布：Micron 提交 8-K' }));
    expect(onGenerateCanvas).toHaveBeenCalledWith(base);
  });

  it('degrades gracefully for an unverified event with no summary and no symbols', () => {
    render(
      <MarketEventCard
        event={{
          ...base,
          trust: 'unverified',
          severity: 'info',
          class: 'news',
          symbols: [],
          payload: { title: '路透社快讯' },
        }}
      />,
    );
    expect(screen.getByText('未核实')).toBeTruthy();
    expect(screen.getByText('一般')).toBeTruthy();
    expect(screen.getByText('新闻')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'MU' })).toBeNull();
  });
});
