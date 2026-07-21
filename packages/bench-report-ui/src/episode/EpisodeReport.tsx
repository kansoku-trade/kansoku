import { useMemo } from 'react';
import type { EpisodeReportViewData } from '../types';
import { AuditPanel } from './AuditPanel';
import { CaseDetail } from './CaseDetail';
import { CasesTable } from './CasesTable';
import { Header } from './Header';
import { ModelTable } from './ModelTable';
import { ReasonTable } from './ReasonTable';
import { SummaryPanel } from './SummaryPanel';
import { useCaseFilters } from './useCaseFilters';
import '../styles/theme.css';
import '../ui/styles/controls.css';
import './styles/reportBase.css';
import './styles/chart.css';
import './styles/sidebar.css';
import './styles/process.css';
import './styles/reason.css';

export function EpisodeReport({ data }: { data: EpisodeReportViewData }) {
  const filters = useCaseFilters(data.cases);
  const chartsById = useMemo(
    () => new Map(data.charts.map((chart) => [chart.id, chart])),
    [data.charts],
  );

  return (
    <main className="report">
      <Header data={data} />
      <SummaryPanel data={data} />
      <ReasonTable data={data} />
      <ModelTable data={data} />
      <CasesTable data={data} filters={filters} />
      <section className="case-details">
        {data.caseDetails.map((detail) => (
          <CaseDetail
            key={detail.index}
            detail={detail}
            payload={chartsById.get(detail.chartId)}
            hidden={!filters.isVisible(detail.index)}
          />
        ))}
      </section>
      <AuditPanel audit={data.audit} />
      <footer className="footer">
        <span>KANSOKU BENCH · Git {data.gitSha ?? '—'}</span>
        <span>
          图表由{' '}
          <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
            TradingView Lightweight Charts™
          </a>{' '}
          提供 · 行情数据源：长桥
        </span>
      </footer>
    </main>
  );
}