import { ArrowLeft } from 'lucide-react';
import type { ChartMeta } from '@kansoku/shared/types';
import { symbolAnalysisPath } from '@kansoku/shared/chartUrl';
import { CockpitSkeleton } from '@web/features/cockpit/CockpitSkeleton';
import { useLiveQuote } from '@web/features/quotes/useLiveQuote';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Empty, ErrorBox } from '@web/ui';
import { useIntradayDoc } from '../intraday/useIntradayDoc';
import { SepaCockpit, type SepaDocView } from './SepaCockpit';

function PinnedSepaView({ sym, analysisId }: { sym: string; analysisId: string }) {
  const liveQuote = useLiveQuote(sym);
  const { doc, error, reload } = useIntradayDoc(analysisId);

  if (error) {
    return (
      <div className="page">
        <ErrorBox>{error}</ErrorBox>
      </div>
    );
  }
  if (!doc) return <CockpitSkeleton />;
  if (doc.built.kind !== 'sepa') {
    return (
      <div className="page">
        <ErrorBox>
          <p>这份分析不是 SEPA 仪表盘。</p>
          <a href={symbolAnalysisPath(sym, analysisId)}>去驾驶舱查看</a>
        </ErrorBox>
      </div>
    );
  }
  const sepaDoc: SepaDocView = { ...doc, built: doc.built };
  return <SepaCockpit sym={sym} doc={sepaDoc} reload={reload} liveQuote={liveQuote} />;
}

function LatestSepaView({ sym }: { sym: string }) {
  const liveQuote = useLiveQuote(sym);
  const { data: charts, error: listError } = useQuery<ChartMeta[]>(
    `charts.list:sepa:${sym}`,
    () => client.charts.list({ type: 'sepa', symbol: sym }),
    { persist: false },
  );
  const latestId = charts?.[0]?.id ?? null;
  const { doc, error: docError, reload } = useIntradayDoc(latestId);

  if (listError) {
    return (
      <div className="page">
        <ErrorBox>{listError}</ErrorBox>
      </div>
    );
  }
  if (!charts) return <CockpitSkeleton />;
  if (charts.length === 0) {
    return (
      <div className="page">
        <Empty>
          <p>这只股票还没有 SEPA 仪表盘</p>
          <a href={symbolAnalysisPath(sym, null)}>
            <ArrowLeft className="icon" size={13} /> 返回驾驶舱
          </a>
        </Empty>
      </div>
    );
  }
  if (docError) {
    return (
      <div className="page">
        <ErrorBox>{docError}</ErrorBox>
      </div>
    );
  }
  if (!doc || doc.built.kind !== 'sepa') return <CockpitSkeleton />;
  const sepaDoc: SepaDocView = { ...doc, built: doc.built };
  return <SepaCockpit sym={sym} doc={sepaDoc} reload={reload} liveQuote={liveQuote} />;
}

export function SepaSymbolPage({
  sym,
  analysisId,
}: {
  sym: string;
  analysisId: string | null;
}) {
  if (analysisId) return <PinnedSepaView sym={sym} analysisId={analysisId} />;
  return <LatestSepaView sym={sym} />;
}
