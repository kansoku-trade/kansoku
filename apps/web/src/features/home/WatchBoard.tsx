import type { OverviewBoard, OverviewRow } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { fmt, signed } from '@web/lib/format';
import { Badge, Card, Dot, Empty, ErrorBox, MarketTime, Num } from '@web/ui';
import { directionTone } from '@web/features/charts/intraday/directionLabels';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { FollowToggle, ReassessButton } from './SymbolActions';

const DIRECTION_LABEL: Record<string, string> = { long: '做多', short: '做空', neutral: '观望' };

const styles = stylex.create({
  watchStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  watchStripCell: {
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSizes.md,
    fontVariantNumeric: 'tabular-nums',
    gap: '7px',
  },
  watchStripSymbol: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  overviewGrid: {
    display: 'grid',
    gap: '12px',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    marginTop: '12px',
  },
  symbolCardHead: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
  symbolCardSymbol: {
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: 600,
  },
  symbolCardQuote: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontVariantNumeric: 'tabular-nums',
  },
  symbolCardLevels: {
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.md,
    fontVariantNumeric: 'tabular-nums',
    gap: '14px',
    marginTop: '8px',
  },
  symbolCardComment: {
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    color: colors.textSecondary,
    display: '-webkit-box',
    fontSize: fontSizes.md,
    lineHeight: 1.4,
    marginTop: '8px',
    overflow: 'hidden',
  },
  symbolCardCommentWarn: {
    color: colors.accent,
  },
  symbolCardCommentAlert: {
    color: colors.down,
  },
  unreadBadge: {
    marginLeft: '4px',
  },
});

function pctCell(value: number | null): string {
  return value == null ? '—' : `${signed(value)}%`;
}

function SymbolCard({ row }: { row: OverviewRow }) {
  const comment = row.latest_comment;
  return (
    <Card link className="symbol-card" href={`/symbol/${encodeURIComponent(row.symbol)}`}>
      <div className={`symbol-card-head ${stylex.props(styles.symbolCardHead).className}`}>
        <span className={`sym ${stylex.props(styles.symbolCardSymbol).className}`}>
          {row.symbol}
        </span>
        {row.direction && (
          <Badge tone={directionTone(row.direction)}>{DIRECTION_LABEL[row.direction]}</Badge>
        )}
        {row.last != null && (
          <span className={`quote ${stylex.props(styles.symbolCardQuote).className}`}>
            {fmt(row.last)}
            {row.pct != null && (
              <>
                {' '}
                <Num value={row.pct} diff suffix="%" />
              </>
            )}
          </span>
        )}
        <FollowToggle symbol={row.symbol} initialFollowing={row.ai_following} />
        {row.prediction_stale && <Dot tone="accent" title="预测已过期" />}
        {row.alert_count > 0 && (
          <Badge
            tone="down"
            className={`unread-badge ${stylex.props(styles.unreadBadge).className}`}
          >
            {row.alert_count}
          </Badge>
        )}
      </div>
      <div className={`symbol-card-levels ${stylex.props(styles.symbolCardLevels).className}`}>
        <span>止损 {pctCell(row.stop_distance_pct)}</span>
        <span>目标1 {pctCell(row.target1_distance_pct)}</span>
        {row.entry != null && <span>入场 {fmt(row.entry)}</span>}
        <ReassessButton symbol={row.symbol} />
      </div>
      {comment && (
        <div
          className={`symbol-card-comment ${comment.level} ${
            stylex.props(
              styles.symbolCardComment,
              comment.level === 'warn' && styles.symbolCardCommentWarn,
              comment.level === 'alert' && styles.symbolCardCommentAlert,
            ).className
          }`}
        >
          <MarketTime value={comment.ts} format="clock" /> · {comment.text}
        </div>
      )}
    </Card>
  );
}

export function WatchBoard({
  board,
  error,
  compact,
}: {
  board: OverviewBoard | null;
  error: string | null;
  compact: boolean;
}) {
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!board) return <div className="note-block">看盘数据加载中…</div>;
  if (board.rows.length === 0) {
    return <Empty>今天还没有 intraday 分析——去 cockpit 或跑一次 intraday-signal</Empty>;
  }
  if (compact) {
    return (
      <div {...stylex.props(styles.watchStrip)}>
        {board.rows.map((row) => (
          <Card
            link
            {...stylex.props(styles.watchStripCell)}
            key={row.symbol}
            href={`/symbol/${encodeURIComponent(row.symbol)}`}
          >
            <span {...stylex.props(styles.watchStripSymbol)}>
              {row.symbol.replace(/\.US$/, '')}
            </span>
            {row.direction && (
              <Badge tone={directionTone(row.direction)}>{DIRECTION_LABEL[row.direction]}</Badge>
            )}
            {row.pct != null && <Num value={row.pct} diff suffix="%" />}
            <FollowToggle symbol={row.symbol} initialFollowing={row.ai_following} compact />
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className={`overview-grid ${stylex.props(styles.overviewGrid).className}`}>
      {board.rows.map((row) => (
        <SymbolCard key={row.symbol} row={row} />
      ))}
    </div>
  );
}
