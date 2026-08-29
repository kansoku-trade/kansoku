// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CockpitComment, CommentStance } from '@kansoku/shared/types';
import { CommentEntry } from './CommentEntry';

afterEach(() => {
  cleanup();
});

const base: CockpitComment = {
  ts: '2026-07-24T14:32:00.000Z',
  symbol: 'MU.US',
  level: 'warn',
  text: '5 分钟 K 线跌破 120 支撑，量能放大到 2.1 倍',
  source: 'commentator',
};

describe('CommentEntry legacy rendering', () => {
  it('renders a comment with null read/stance exactly as the flat single-line style', () => {
    render(<CommentEntry symbol="MU.US" comment={base} />);

    expect(screen.getByText(base.text)).toBeTruthy();
    expect(screen.queryByText('按计划执行')).toBeNull();
    expect(screen.queryByText('等确认')).toBeNull();
    expect(screen.queryByText('不构成动作')).toBeNull();
  });

  it('still shows trigger/escalated/source meta for a legacy comment', () => {
    render(
      <CommentEntry
        symbol="MU.US"
        comment={{ ...base, trigger: 'level_break', escalated: true, source: 'analyst' }}
      />,
    );

    expect(screen.getByText('触发：level_break')).toBeTruthy();
    expect(screen.getByText('已升级重估')).toBeTruthy();
    expect(screen.getByText('分析员')).toBeTruthy();
  });
});

describe('CommentEntry structured rendering', () => {
  it('renders fact / read / stance as three lines when read and stance are present', () => {
    const comment: CockpitComment = {
      ...base,
      read: '跌破前一天低点且量能放大，真实破位而非洗盘',
      stance: 'wait_confirm',
      stanceNote: '等下一根 5 分钟收盘确认',
    };
    const { container } = render(<CommentEntry symbol="MU.US" comment={comment} />);

    expect(screen.getByText(base.text)).toBeTruthy();
    expect(screen.getByText(comment.read!)).toBeTruthy();
    expect(screen.getByText('等确认')).toBeTruthy();
    expect(screen.getByText('等下一根 5 分钟收盘确认')).toBeTruthy();
    expect(container.querySelector('.ai-fact')).toBeTruthy();
    expect(container.querySelector('.ai-read')).toBeTruthy();
    expect(container.querySelector('.ai-stance')).toBeTruthy();
  });

  const stanceCases: Array<[CommentStance, string]> = [
    ['act_per_plan', '按计划执行'],
    ['wait_confirm', '等确认'],
    ['no_action', '不构成动作'],
  ];

  it.each(stanceCases)('maps stance %s to the label %s', (stance, label) => {
    const comment: CockpitComment = { ...base, read: '证据文本', stance };
    render(<CommentEntry symbol="MU.US" comment={comment} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe('CommentEntry stacked meta row', () => {
  function expectStacked(container: HTMLElement) {
    const item = container.querySelector('.ai-item');
    expect(item).toBeTruthy();
    const meta = item!.querySelector(':scope > .ai-meta-row');
    const body = item!.querySelector(':scope > .body');
    expect(meta).toBeTruthy();
    expect(body).toBeTruthy();
    expect(item!.firstElementChild).toBe(meta);
    expect(meta!.nextElementSibling).toBe(body);
    expect(meta!.querySelector('.t')).toBeTruthy();
  }

  it('puts time and level above the body for a legacy comment', () => {
    const { container } = render(<CommentEntry symbol="MU.US" comment={base} />);
    expectStacked(container);
    const meta = container.querySelector('.ai-meta-row')!;
    const body = container.querySelector('.body')!;
    expect(meta.querySelector('.level-badge')?.textContent).toBe('warn');
    expect(body.querySelector('.level-badge')).toBeNull();
  });

  it('puts time, level, and stance above fact/read for a structured comment', () => {
    const comment: CockpitComment = {
      ...base,
      read: '跌破前一天低点且量能放大，真实破位而非洗盘',
      stance: 'wait_confirm',
      stanceNote: '等下一根 5 分钟收盘确认',
    };
    const { container } = render(<CommentEntry symbol="MU.US" comment={comment} />);
    expectStacked(container);
    const meta = container.querySelector('.ai-meta-row')!;
    const body = container.querySelector('.body')!;
    expect(meta.querySelector('.level-badge')?.textContent).toBe('warn');
    expect(meta.querySelector('.stance-badge')?.textContent).toBe('等确认');
    expect(body.querySelector('.level-badge')).toBeNull();
    expect(body.querySelector('.stance-badge')).toBeNull();
    expect(body.querySelector('.ai-fact')?.textContent).toContain(base.text);
    expect(body.querySelector('.ai-stance')?.textContent).toBe('等下一根 5 分钟收盘确认');
  });

  it('puts time and stance above markdown for an explainer comment', async () => {
    const comment: CockpitComment = {
      ts: '2026-07-24T15:00:00.000Z',
      symbol: 'MU.US',
      level: 'info',
      source: 'explainer',
      trigger: 'manual: 解读请求',
      stance: 'no_action',
      text: '## 图上有什么\n价格线、5 分钟 MACD、当天计划位。',
    };
    const { container } = render(<CommentEntry symbol="MU.US" comment={comment} />);
    expectStacked(container);
    const meta = container.querySelector('.ai-meta-row')!;
    const body = container.querySelector('.body')!;
    expect(meta.querySelector('.stance-badge')?.textContent).toBe('不构成动作');
    expect(meta.querySelector('.level-badge')).toBeNull();
    expect(body.querySelector('.stance-badge')).toBeNull();
    expect(body.querySelector('.ai-explainer-card')).toBeTruthy();
    expect(await screen.findByText('图上有什么')).toBeTruthy();
  });
});

describe('CommentEntry explainer rendering', () => {
  it('renders an explainer-source comment as a multi-paragraph prose card with a stance badge', async () => {
    const comment: CockpitComment = {
      ts: '2026-07-24T15:00:00.000Z',
      symbol: 'MU.US',
      level: 'info',
      source: 'explainer',
      trigger: 'manual: 解读请求',
      stance: 'no_action',
      text: '## 图上有什么\n价格线、5 分钟 MACD、当天计划位。\n\n## 一句话结论\n目前不构成动作。',
    };
    const { container } = render(<CommentEntry symbol="MU.US" comment={comment} />);

    expect(await screen.findByText('不构成动作')).toBeTruthy();
    expect(container.querySelector('.ai-item--explainer')).toBeTruthy();
    expect(container.querySelector('.ai-explainer-card')).toBeTruthy();
    expect(container.querySelector('.ai-fact')).toBeNull();
    expect(container.querySelector('.ai-read')).toBeNull();
    expect(await screen.findByText('图上有什么')).toBeTruthy();
    expect(await screen.findByText(/价格线、5 分钟 MACD、当天计划位/)).toBeTruthy();
  });
});
