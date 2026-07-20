// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchDocument, ResearchDocumentMeta } from '@kansoku/core/contract/index';

let capabilities: { features?: Record<string, string> } = { features: { 'research-ai': 'locked' } };

vi.mock('@web/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));

const { ResearchAssistant } = await import('./ResearchAssistant');

const document: ResearchDocument = {
  path: 'stocks/MRVL.md',
  kind: 'stock',
  type: 'stock',
  title: 'MRVL',
  date: null,
  symbols: ['MRVL'],
  mtime: '2026-07-18T00:00:00.000Z',
  excerpt: '',
  markdown: '# MRVL',
  revision: 'r1',
};

const related: ResearchDocumentMeta[] = [
  {
    path: 'stocks/AVGO.md',
    kind: 'stock',
    type: 'stock',
    title: 'AVGO',
    date: null,
    symbols: ['AVGO'],
    mtime: '2026-07-18T00:00:00.000Z',
    excerpt: '',
  },
];

afterEach(() => {
  cleanup();
  capabilities = { features: { 'research-ai': 'locked' } };
});

describe('ResearchAssistant free stub', () => {
  it('renders the locked placeholder + browse card when research-ai is locked', () => {
    capabilities = { features: { 'research-ai': 'locked' } };

    render(
      <ResearchAssistant
        document={document}
        selected={document}
        related={related}
        onSelect={vi.fn()}
        onDocumentChanged={vi.fn()}
      />,
    );

    expect(screen.getByText(/研究库 AI/)).toBeTruthy();
    expect(screen.getByText('订阅解锁')).toBeTruthy();
    expect(screen.getByText(/关联资料/)).toBeTruthy();
    expect(screen.queryByText('打开 AI 助手')).toBeNull();
  });

  it('renders the browse card only for a community build (pro:false), no locked notice', () => {
    capabilities = { features: { 'research-ai': 'absent' } };

    render(
      <ResearchAssistant
        document={document}
        selected={document}
        related={related}
        onSelect={vi.fn()}
        onDocumentChanged={vi.fn()}
      />,
    );

    expect(screen.getByText(/关联资料/)).toBeTruthy();
    expect(screen.queryByText(/研究库 AI/)).toBeNull();
    expect(screen.queryByText('订阅解锁')).toBeNull();
    expect(screen.queryByText('打开 AI 助手')).toBeNull();
  });

  it('renders a link to the full AI assistant when active', () => {
    capabilities = { features: { 'research-ai': 'active' } };

    render(
      <ResearchAssistant
        document={document}
        selected={document}
        related={related}
        onSelect={vi.fn()}
        onDocumentChanged={vi.fn()}
      />,
    );

    const link = screen.getByText('打开 AI 助手').closest('a');
    expect(link?.getAttribute('href')).toBe(
      `/research/assistant?path=${encodeURIComponent(document.path)}`,
    );
    expect(screen.queryByText('订阅解锁')).toBeNull();
  });
});
