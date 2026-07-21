import { useState } from 'react';
import type { LeaderboardReportViewData } from '../types';
import { DetailCard } from './DetailCard';
import { Footer } from './Footer';
import { LeaderboardTable } from './LeaderboardTable';
import { MetricStrip } from './MetricStrip';
import { ScatterPanel } from './ScatterPanel';
import { TopBar } from './TopBar';
import '../styles/theme.css';
import '../ui/styles/controls.css';
import './styles/topbar.css';
import './styles/table.css';
import './styles/scatter.css';
import './styles/detail.css';

export function LeaderboardReport({ data }: { data: LeaderboardReportViewData }) {
  const [selectedId, setSelectedId] = useState<string | null>(data.initialSelectedId);

  return (
    <>
      <TopBar runId={data.runId} />
      <div className="page">
        <MetricStrip data={data} />
        <div className="shell">
          <div className="grid">
            <LeaderboardTable data={data} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="plotwrap">
              <ScatterPanel data={data} selectedId={selectedId} onSelect={setSelectedId} />
              <DetailCard detail={selectedId ? data.details[selectedId] : undefined} />
            </div>
          </div>
        </div>
        <Footer data={data} />
      </div>
    </>
  );
}
