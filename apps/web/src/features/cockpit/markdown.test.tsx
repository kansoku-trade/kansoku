// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownLink } from './markdown';

afterEach(() => {
  cleanup();
});

describe('MarkdownLink', () => {
  it('renders a pinned SEPA dashboard link with the analysis id as the detail', () => {
    render(
      <MarkdownLink href="/symbol/sepa/TSM.US?analysis=2026-07-20-tsm-sepa">SEPA</MarkdownLink>,
    );

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/symbol/sepa/TSM.US?analysis=2026-07-20-tsm-sepa');
    expect(link.className).toContain('app-deep-link--sepa');
    expect(link.getAttribute('aria-label')).toBe(
      '打开 SEPA 仪表盘：TSM.US，2026-07-20-tsm-sepa',
    );
  });

  it('renders the living-dashboard SEPA link with a fallback detail', () => {
    render(<MarkdownLink href="/symbol/sepa/TSM.US">SEPA</MarkdownLink>);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/symbol/sepa/TSM.US');
    expect(link.getAttribute('aria-label')).toBe('打开 SEPA 仪表盘：TSM.US，最新 SEPA 状态');
  });

  it('still renders the legacy cockpit card unchanged', () => {
    render(<MarkdownLink href="/symbol/MU.US">cockpit</MarkdownLink>);

    const link = screen.getByRole('link');
    expect(link.className).toContain('app-deep-link--cockpit');
    expect(link.getAttribute('aria-label')).toBe('打开股票驾驶舱：MU.US，最新分析与实时行情');
  });

  it('still renders the legacy pinned-analysis card unchanged', () => {
    render(<MarkdownLink href="/symbol/MU.US?analysis=2026-07-09-mu-intraday-1">analysis</MarkdownLink>);

    const link = screen.getByRole('link');
    expect(link.className).toContain('app-deep-link--analysis');
    expect(link.getAttribute('aria-label')).toBe(
      '打开这份分析：MU.US，2026-07-09-mu-intraday-1',
    );
  });

  it('falls back to a plain anchor for a non-app href', () => {
    render(<MarkdownLink href="https://example.com">external</MarkdownLink>);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.className).toBe('');
  });
});
