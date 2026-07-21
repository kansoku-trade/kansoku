import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EpisodeReport } from '../src/episode/EpisodeReport';
import type { EpisodeReportViewData } from '../src/types';

const data: EpisodeReportViewData = {
  runId: 'Episode 42',
  generatedAt: '2026-07-21',
  gitSha: null,
  header: {
    datasetChip: 'v2-preview',
    modelsChip: 'model-a',
    modesChip: '盲盘',
    costChip: '0 bps',
    auditChip: { label: '未附加数据审计', tone: 'neutral' },
  },
  summarySubtitle: '1/1 完成 · 0 笔完整交易',
  metrics: [],
  configStrip: [],
  reasonTable: { coverageLabel: '—', rows: [] },
  modelTable: [],
  filters: { models: [], modes: [], outcomes: [] },
  cases: [],
  caseDetails: [],
  charts: [],
  audit: { attached: false, passed: 0, total: 0, checks: [] },
};

describe('EpisodeReport', () => {
  it('renders a header from the given data', () => {
    render(<EpisodeReport data={data} />);
    expect(screen.getByRole('heading', { name: 'Episode 42' })).toBeDefined();
    expect(screen.getByText('2026-07-21')).toBeDefined();
  });
});
