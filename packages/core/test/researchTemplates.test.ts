import { describe, expect, it } from 'vitest';
import { journalSkeleton, stockSkeleton } from '../src/research/templates.js';

const PLACEHOLDER = '还没写。可在右侧让 AI 深度研究填充，或手动补充。';

describe('stockSkeleton', () => {
  it('renders the heading, build date, sepa link, and six empty lens sections', () => {
    const markdown = stockSkeleton({
      symbol: 'MRVL',
      name: 'Marvell Technology',
      date: '2026-07-23',
      sepaUrl: '/symbol/MRVL.US?analysis=abc123',
    });

    expect(markdown).toContain('# MRVL — Marvell Technology');
    expect(markdown).toContain('建档日期：2026-07-23');
    expect(markdown).toContain('[SEPA 仪表盘](/symbol/MRVL.US?analysis=abc123)');

    for (const heading of ['业务', '基本面', '技术面', '催化剂', '供应链与同行', '风险与待验证']) {
      expect(markdown).toContain(`## ${heading}`);
    }
    expect(markdown.match(new RegExp(PLACEHOLDER, 'g'))).toHaveLength(6);
  });

  it('keeps non-US market suffixes in the heading', () => {
    const markdown = stockSkeleton({
      symbol: '700.HK',
      name: '腾讯控股',
      date: '2026-07-23',
      sepaUrl: '/symbol/700.HK?analysis=xyz',
    });

    expect(markdown).toContain('# 700.HK — 腾讯控股');
  });
});

describe('journalSkeleton', () => {
  it('renders the heading, date line, and four empty sections', () => {
    const markdown = journalSkeleton({ title: 'MU 供给纪律复盘', date: '2026-07-23' });

    expect(markdown).toContain('# MU 供给纪律复盘');
    expect(markdown).toContain('日期：2026-07-23');

    for (const heading of ['背景', '观察', '结论', '待验证']) {
      expect(markdown).toContain(`## ${heading}`);
    }
    expect(markdown.match(new RegExp(PLACEHOLDER, 'g'))).toHaveLength(4);
  });
});
