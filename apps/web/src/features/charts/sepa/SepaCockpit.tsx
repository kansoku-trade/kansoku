import { ArrowLeft } from 'lucide-react';
import type { QuoteCell, SepaBuilt } from '@kansoku/shared/types';
import { useSepaRefresh } from '@web/features/cockpit/useSepaRefresh';
import { TopbarQuote } from '@web/features/quotes/QuoteBar';
import { Button, Spinner } from '@web/ui';
import type { ChartDocView } from '../intraday/useIntradayDoc';
import { SepaDashboard } from './SepaDashboard';

export type SepaDocView = ChartDocView & { built: SepaBuilt };

export function SepaCockpit({
  sym,
  doc,
  reload,
  liveQuote,
}: {
  sym: string;
  doc: SepaDocView;
  reload: () => void;
  liveQuote: QuoteCell | null;
}) {
  const sepaRefresh = useSepaRefresh(doc, reload);
  const isResearchSepa = doc.input.origin === 'research';
  const sepaDataDate = doc.built.sidebar.asOf.slice(0, 10);

  return (
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="/">
          <ArrowLeft className="icon" size={13} /> 列表
        </a>
        <span className="title">{doc.title}</span>
        <span className="meta">{sym}</span>
        {isResearchSepa &&
          (sepaRefresh.refreshing ? (
            <span className="ai-hint">
              <Spinner /> 正在更新到最新数据…
            </span>
          ) : (
            sepaRefresh.error && (
              <span className="ai-hint">更新失败，展示的是 {sepaDataDate} 的数据</span>
            )
          ))}
        <span className="topbar-actions">
          {isResearchSepa && (
            <Button onClick={() => void sepaRefresh.refresh()} disabled={sepaRefresh.refreshing}>
              更新数据
            </Button>
          )}
          {doc.symbol && <TopbarQuote quote={liveQuote} />}
        </span>
      </div>
      <div className="detail-body">
        <SepaDashboard built={doc.built} />
      </div>
    </div>
  );
}
