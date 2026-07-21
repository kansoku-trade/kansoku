import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LeaderboardReport } from '../src/leaderboard/LeaderboardReport';
import type { LeaderboardReportViewData } from '../src/types';

function makeData(): LeaderboardReportViewData {
  return {
    runId: 'run-1',
    generatedAt: '2026-07-21T00:00:00.000Z',
    title: '模型交易判断力总榜',
    subtitle: { prefix: '2 个模型 · 1 条基线 · 10 cells', beatenLabel: '2/2' },
    n: 3,
    kvs: [{ label: 'DATASET', value: 'v1' }],
    realRows: [
      {
        id: 'openai/gpt-5',
        rank: 1,
        isBaseline: false,
        name: 'gpt-5',
        vendor: 'openai',
        baselineBadge: false,
        total: '72.0',
        delta: { tone: 'pos', text: '+5.0' },
        judgment: { fillRatio: 0.8, text: '80.0', kind: 'j' },
        efficiency: { fillRatio: 0.6, text: '60.0', kind: 'e' },
        winRate: '55.0%',
        abstainRate: '10.0%',
        cost: '$0.0100',
        duration: '2.0s',
        violationRate: '0.0%',
      },
      {
        id: 'anthropic/claude',
        rank: 2,
        isBaseline: false,
        name: 'claude',
        vendor: 'anthropic',
        baselineBadge: false,
        total: '68.0',
        delta: { tone: 'neg', text: '−1.0' },
        judgment: { fillRatio: 0.7, text: '70.0', kind: 'j' },
        efficiency: { fillRatio: 0.4, text: '40.0', kind: 'e' },
        winRate: '50.0%',
        abstainRate: '12.0%',
        cost: '$0.0200',
        duration: '3.0s',
        violationRate: '1.0%',
      },
    ],
    baselineRows: [
      {
        id: 'baseline/buy-hold',
        rank: null,
        isBaseline: true,
        name: '买入持有',
        vendor: null,
        baselineBadge: true,
        total: '65.0',
        delta: null,
        judgment: { fillRatio: 0.65, text: '65.0', kind: 'muted' },
        efficiency: null,
        winRate: '—',
        abstainRate: '—',
        cost: '—',
        duration: '—',
        violationRate: '—',
      },
    ],
    passLineLabel: 'BUY & HOLD 基线 · 判断分 65.0',
    scatter: {
      width: 460,
      height: 320,
      padL: 56,
      padT: 20,
      innerRight: 440,
      innerBottom: 276,
      xTicks: [{ cx: 100, label: '0' }],
      yTicks: [{ cy: 100, label: '50' }],
      baseline: { y: 150, label: '买入持有基线 · 65.0' },
      dots: [
        {
          id: 'openai/gpt-5',
          name: 'gpt-5',
          cx: 200,
          cy: 100,
          r: 7,
          lead: true,
          below: false,
          labelX: 209,
          labelY: 92,
          anchor: 'start',
        },
        {
          id: 'anthropic/claude',
          name: 'claude',
          cx: 260,
          cy: 140,
          r: 6,
          lead: false,
          below: false,
          labelX: 269,
          labelY: 132,
          anchor: 'start',
        },
      ],
    },
    scatterLegend: { belowLabel: '低于买入持有基线' },
    details: {
      'openai/gpt-5': {
        id: 'openai/gpt-5',
        name: 'gpt-5',
        vendor: 'openai',
        did: 'openai/gpt-5 · 10 cells · avg 3.0 tool-calls',
        sections: [{ title: '盲盘 vs 实盘', rows: [{ label: '盲盘 判断分', value: '80.0', tone: '' }] }],
      },
      'anthropic/claude': {
        id: 'anthropic/claude',
        name: 'claude',
        vendor: 'anthropic',
        did: 'anthropic/claude · 10 cells · avg 2.0 tool-calls',
        sections: [{ title: '盲盘 vs 实盘', rows: [{ label: '盲盘 判断分', value: '70.0', tone: '' }] }],
      },
      'baseline/buy-hold': {
        id: 'baseline/buy-hold',
        name: '买入持有',
        vendor: 'baseline',
        did: 'baseline/buy-hold · 10 cells · avg 0.0 tool-calls',
        sections: [],
      },
    },
    initialSelectedId: 'openai/gpt-5',
    footer: { datasetVersion: 'v1', runId: 'run-1', generatedAt: '2026-07-21T00:00:00.000Z' },
  };
}

describe('LeaderboardReport', () => {
  afterEach(() => cleanup());

  it('renders the title and initial selection', () => {
    render(<LeaderboardReport data={makeData()} />);
    expect(screen.getByRole('heading', { name: '模型交易判断力总榜' })).toBeDefined();
    expect(screen.getByText('openai/gpt-5 · 10 cells · avg 3.0 tool-calls')).toBeDefined();
  });

  it('renders one scatter dot per real model', () => {
    const { container } = render(<LeaderboardReport data={makeData()} />);
    expect(container.querySelectorAll('circle.dot').length).toBe(2);
  });

  it('renders gauge fill widths from the fill ratio', () => {
    const { container } = render(<LeaderboardReport data={makeData()} />);
    const row = container.querySelector('tr[data-model="openai/gpt-5"]')!;
    const bar = row.querySelector('.bartrack i') as HTMLElement;
    expect(bar.style.width).toBe('80%');
  });

  it('swaps the detail card and dot selection class when a table row is clicked', () => {
    const { container } = render(<LeaderboardReport data={makeData()} />);
    expect(screen.getByText('openai/gpt-5 · 10 cells · avg 3.0 tool-calls')).toBeDefined();

    const row = container.querySelector('tr[data-model="anthropic/claude"]')!;
    fireEvent.click(row);

    expect(screen.getByText('anthropic/claude · 10 cells · avg 2.0 tool-calls')).toBeDefined();
    expect(container.querySelector('circle[data-model="anthropic/claude"]')?.classList.contains('sel')).toBe(
      true,
    );
    expect(container.querySelector('circle[data-model="openai/gpt-5"]')?.classList.contains('sel')).toBe(
      false,
    );
  });

  it('swaps selection when a scatter dot is clicked', () => {
    const { container } = render(<LeaderboardReport data={makeData()} />);
    const dot = container.querySelector('circle[data-model="anthropic/claude"]')!;
    fireEvent.click(dot);

    expect(container.querySelector('tr[data-model="anthropic/claude"]')?.classList.contains('sel')).toBe(
      true,
    );
    expect(screen.getByText('anthropic/claude · 10 cells · avg 2.0 tool-calls')).toBeDefined();
  });

  it('renders beaten label in subtitle when beatenLabel is present', () => {
    const { container } = render(<LeaderboardReport data={makeData()} />);
    const subtitle = container.querySelector('.sub');
    const beatenBold = subtitle?.querySelector('b');

    expect(beatenBold).toBeDefined();
    expect(beatenBold?.textContent).toBe('2/2');
    expect(subtitle?.textContent).toContain('2/2');
    expect(subtitle?.textContent).toContain('判断分跑赢买入持有');
  });

  it('does not render beaten label when beatenLabel is null', () => {
    const data = makeData();
    data.subtitle.beatenLabel = null;
    const { container } = render(<LeaderboardReport data={data} />);
    const subtitle = container.querySelector('.sub');
    const beatenBold = subtitle?.querySelector('b');

    expect(beatenBold).toBeNull();
    expect(subtitle?.textContent).not.toContain('判断分跑赢买入持有');
  });
});
