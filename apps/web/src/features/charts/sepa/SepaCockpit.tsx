import * as stylex from '@stylexjs/stylex';
import { ArrowLeft } from 'lucide-react';
import type { QuoteCell, SepaBuilt } from '@kansoku/shared/types';
import { useSepaRefresh } from '@web/features/cockpit/useSepaRefresh';
import { TopbarQuote } from '@web/features/quotes/QuoteBar';
import { Button, Spinner } from '@web/ui';
import { isDesktopRealtime } from '../../../lib/portTransport';
import type { ChartDocView } from '../intraday/useIntradayDoc';
import { colors, fontSizes } from '../../../theme/tokens.stylex';
import { SepaDashboard } from './SepaDashboard';

const styles = stylex.create({
  fullpage: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  fullpageDesktop: {
    height: 'calc(100vh - 40px)',
  },
  detailTopbar: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    fontSize: fontSizes.md,
    gap: '12px',
    padding: '8px 14px',
  },
  title: {
    color: colors.textPrimary,
    fontWeight: 500,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
  },
  aiHint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  topbarActions: {
    alignItems: 'center',
    display: 'inline-flex',
    flex: '1 1 auto',
    gap: '8px',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
    minWidth: 0,
  },
  detailBody: {
    flex: 1,
    minHeight: 0,
  },
});

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
  const desktopRealtime = isDesktopRealtime();

  return (
    <div
      className={`fullpage ${stylex.props(styles.fullpage, desktopRealtime && styles.fullpageDesktop).className}`}
    >
      <div className={`detail-topbar ${stylex.props(styles.detailTopbar).className}`}>
        <a href="/">
          <ArrowLeft className="icon" size={13} /> 列表
        </a>
        <span className={`title ${stylex.props(styles.title).className}`}>{doc.title}</span>
        <span className={`meta ${stylex.props(styles.meta).className}`}>{sym}</span>
        {isResearchSepa &&
          (sepaRefresh.refreshing ? (
            <span className={`ai-hint ${stylex.props(styles.aiHint).className}`}>
              <Spinner /> 正在更新到最新数据…
            </span>
          ) : (
            sepaRefresh.error && (
              <span className={`ai-hint ${stylex.props(styles.aiHint).className}`}>
                更新失败，展示的是 {sepaDataDate} 的数据
              </span>
            )
          ))}
        <span className={`topbar-actions ${stylex.props(styles.topbarActions).className}`}>
          {isResearchSepa && (
            <Button onClick={() => void sepaRefresh.refresh()} disabled={sepaRefresh.refreshing}>
              更新数据
            </Button>
          )}
          {doc.symbol && <TopbarQuote quote={liveQuote} />}
        </span>
      </div>
      <div className={`detail-body ${stylex.props(styles.detailBody).className}`}>
        <SepaDashboard built={doc.built} />
      </div>
    </div>
  );
}
