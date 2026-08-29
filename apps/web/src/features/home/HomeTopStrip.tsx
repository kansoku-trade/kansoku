import type { MarketTemp, QuoteCell } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { signed, upDown } from '@web/lib/format';
import { Badge, DataAgeBadge, Dot } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { RecapCell } from './RecapCell';

export const INDEX_SYMBOLS = ['SPY.US', 'QQQ.US', '.DJI.US', '.VIX.US'];

interface HomeTopStripProps {
  sessionLabel: string | null;
  date: string;
  isToday: boolean;
  quotes: QuoteCell[];
  market: MarketTemp | null | undefined;
  degraded: boolean;
  snapshotAt: number | null;
  recapDate: string | null;
}

const styles = stylex.create({
  root: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundSurface,
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'display': 'grid',
    'fontVariantNumeric': 'tabular-nums',
    'gap': '20px',
    'gridTemplateColumns': 'auto 1fr auto',
    'margin': '4px 0 12px',
    'padding': '6px 12px',
    '@media (max-width: 900px)': {
      gap: '8px',
      gridTemplateColumns: '1fr',
    },
  },
  id: {
    alignItems: 'baseline',
    display: 'inline-flex',
    gap: '10px',
    minWidth: 0,
  },
  heading: {
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: 700,
    letterSpacing: '0.01em',
    margin: 0,
  },
  date: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  cluster: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '14px',
    minWidth: 0,
  },
  sessionTag: {
    marginLeft: '8px',
    verticalAlign: '3px',
  },
  indexCell: {
    alignItems: 'center',
    color: {
      'default': colors.textSecondary,
      ':hover': colors.accent,
    },
    display: 'inline-flex',
    gap: '6px',
    textDecoration: 'none',
  },
  indexSymbol: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  indexPlaceholder: {
    color: colors.textMuted,
    fontSize: fontSizes.base,
  },
  number: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  up: {
    color: colors.up,
  },
  down: {
    color: colors.down,
  },
  marketTemp: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'inline-flex',
    fontSize: fontSizes.sm,
    gap: '8px',
  },
  tempGauge: {
    backgroundImage: 'linear-gradient(90deg, #60a5fa, #4ade80 55%, #fbbf24 75%, #f87171)',
    borderRadius: 0,
    height: '7px',
    position: 'relative',
    width: '64px',
  },
  tempGaugeMarker: {
    backgroundColor: colors.textPrimary,
    height: '13px',
    position: 'absolute',
    top: '-3px',
    transform: 'translateX(-1px)',
    width: '2px',
  },
});

function IndexCell({ q }: { q: QuoteCell }) {
  const tone = q.pct == null ? '' : upDown(q.pct);
  return (
    <a {...stylex.props(styles.indexCell)} href={`/symbol/${encodeURIComponent(q.symbol)}`}>
      <span className={`idx-sym ${stylex.props(styles.indexSymbol).className}`}>
        {q.symbol.replace(/\.US$/, '')}
      </span>
      <span
        className={`num ${tone} ${stylex.props(styles.number, tone === 'up' && styles.up, tone === 'down' && styles.down).className}`}
      >
        {q.pct == null ? '—' : `${signed(q.pct)}%`}
      </span>
      {q.session !== '日盘' && <Badge className="qc-session">{q.session}</Badge>}
    </a>
  );
}

export function HomeTopStrip({
  sessionLabel,
  date,
  isToday,
  quotes,
  market,
  degraded,
  snapshotAt,
  recapDate,
}: HomeTopStripProps) {
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const cells = INDEX_SYMBOLS.map((s) => bySymbol.get(s)).filter(
    (q): q is QuoteCell => q != null,
  );
  return (
    <div className={`home-top-strip ${stylex.props(styles.root).className}`}>
      <div className={`hts-id ${stylex.props(styles.id).className}`}>
        <h1 {...stylex.props(styles.heading)}>盘面</h1>
        {isToday && sessionLabel && (
          <Badge {...stylex.props(styles.sessionTag)}>{sessionLabel}</Badge>
        )}
        <span className={`num ${stylex.props(styles.date).className}`}>
          {isToday ? date : `${date} · 历史复盘`}
        </span>
      </div>
      <div className={`hts-cluster ${stylex.props(styles.cluster).className}`}>
        <DataAgeBadge at={snapshotAt} />
        {degraded && (
          <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />
        )}
        {cells.length === 0 ? (
          <span {...stylex.props(styles.indexPlaceholder)}>指数行情连接中…</span>
        ) : (
          cells.map((q) => <IndexCell key={q.symbol} q={q} />)
        )}
        {isToday && recapDate && <RecapCell date={recapDate} />}
      </div>
      {market && (
        <span
          className={`market-temp ${stylex.props(styles.marketTemp).className}`}
          title={`市场温度 ${market.temperature}/100${market.description ? ` · ${market.description}` : ''}`}
        >
          <span className="temp-label">温度 {market.temperature}</span>
          <span className={`temp-gauge ${stylex.props(styles.tempGauge).className}`}>
            <i
              {...stylex.props(styles.tempGaugeMarker)}
              style={{ left: `${Math.min(100, Math.max(0, market.temperature))}%` }}
            />
          </span>
          {market.valuation != null && market.sentiment != null && (
            <span className="temp-sub">
              估值 {market.valuation} / 情绪 {market.sentiment}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
