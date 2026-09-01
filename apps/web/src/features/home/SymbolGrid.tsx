import { useState } from 'react';
import type {
  HomeEvents,
  OverviewBoard,
  OverviewRow,
  PortfolioSummary,
  QuoteCell,
} from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { fmt, signed } from '@web/lib/format';
import { Badge, Card, Dot, Empty, MarketTime, Num } from '@web/ui';
import { directionTone } from '@web/features/charts/intraday/directionLabels';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { fmtFlow, fmtFlowLabeled, flowTone } from './flowFormat';
import { INDEX_SYMBOLS } from './HomeTopStrip';
import { FollowToggle, ReassessButton } from './SymbolActions';

const DIRECTION_LABEL: Record<string, string> = { long: '做多', short: '做空', neutral: '观望' };
const EARNINGS_BADGE_DAYS = 7;
const OPTION_SYMBOL_RE = /\d{6}[CP]\d+/;
const MOVER_PCT = 3;
const MOVER_EARNINGS_DAYS = 4;

const styles = stylex.create({
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
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  symbolCardQuote: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
  },
  symbolCardLevels: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.control,
    fontVariantNumeric: 'tabular-nums',
    gap: '14px',
    marginTop: '8px',
  },
  symbolCardComment: {
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    color: colors.textSecondary,
    display: '-webkit-box',
    fontSize: fontSizes.caption,
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
  symbolCardFlowUp: {
    color: colors.up,
  },
  symbolCardFlowDown: {
    color: colors.down,
  },
  watchTail: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '10px',
  },
  watchTailCell: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundSurface,
    'borderColor': colors.border,
    'borderRadius': 0,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'display': 'inline-flex',
    'fontSize': fontSizes.base,
    'fontVariantNumeric': 'tabular-nums',
    'gap': '7px',
    'padding': '4px 10px',
    'textDecoration': 'none',
    'transition': 'border-color 0.12s ease, background-color 0.12s ease',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      borderColor: colors.borderStrong,
    },
  },
  holdBadge: {
    flexShrink: 0,
  },
  tailSymbol: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  tailFlow: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  tailFlowUp: {
    color: colors.up,
  },
  tailFlowDown: {
    color: colors.down,
  },
  tailFold: {
    'backgroundColor': 'transparent',
    'borderColor': colors.borderStrong,
    'borderRadius': 0,
    'borderStyle': 'dashed',
    'borderWidth': '1px',
    'color': colors.textMuted,
    'cursor': 'pointer',
    'fontSize': fontSizes.base,
    'padding': '4px 12px',
    'transition': 'border-color 0.12s ease, background-color 0.12s ease, color 0.12s ease',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      borderColor: colors.focusBorder,
      color: colors.textSecondary,
    },
  },
  unreadBadge: {
    marginLeft: '4px',
  },
});

export function isCardWorthySymbol(symbol: string): boolean {
  return !symbol.startsWith('.') && !OPTION_SYMBOL_RE.test(symbol);
}

export function isMover(entry: GridEntry, today: string | null): boolean {
  const pct = entry.quote?.pct ?? null;
  if (pct != null && Math.abs(pct) >= MOVER_PCT) return true;
  if (entry.earningsDate && today) {
    const cutoff = new Date(
      new Date(`${today}T00:00:00Z`).getTime() + MOVER_EARNINGS_DAYS * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    if (entry.earningsDate <= cutoff) return true;
  }
  return false;
}

interface GridEntry {
  symbol: string;
  quote: QuoteCell | null;
  row: OverviewRow | null;
  flow: number | null;
  owned: boolean;
  earningsDate: string | null;
}

function pctCell(value: number | null): string {
  return value == null ? '—' : `${signed(value)}%`;
}

export function buildGridEntries({
  quotes,
  board,
  portfolio,
  events,
}: {
  quotes: QuoteCell[];
  board: OverviewBoard | null;
  portfolio: PortfolioSummary | null;
  events: HomeEvents | null;
}): GridEntry[] {
  const indexSet = new Set(INDEX_SYMBOLS);
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const rowBySymbol = new Map((board?.rows ?? []).map((r) => [r.symbol, r]));
  const owned = new Set((portfolio?.positions ?? []).map((p) => p.symbol));
  const earningsBySymbol = new Map<string, string>();
  if (events) {
    const cutoff = new Date(
      new Date(`${events.date}T00:00:00Z`).getTime() + EARNINGS_BADGE_DAYS * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    for (const item of events.items) {
      if (item.kind === 'earnings' && item.symbol && item.date <= cutoff) {
        earningsBySymbol.set(item.symbol, item.date);
      }
    }
  }
  const symbols = [...new Set([...quoteBySymbol.keys(), ...rowBySymbol.keys(), ...owned])].filter(
    (s) => !indexSet.has(s) && isCardWorthySymbol(s),
  );
  const flows = board?.flows ?? {};
  const entries = symbols.map((symbol) => ({
    symbol,
    quote: quoteBySymbol.get(symbol) ?? null,
    row: rowBySymbol.get(symbol) ?? null,
    flow: flows[symbol] ?? null,
    owned: owned.has(symbol),
    earningsDate: earningsBySymbol.get(symbol) ?? null,
  }));
  return entries.sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    return a.symbol < b.symbol ? -1 : 1;
  });
}

function GridCard({ entry }: { entry: GridEntry }) {
  const { symbol, quote, row, flow, owned, earningsDate } = entry;
  const flowToneValue = flowTone(flow);
  const flowStyle =
    flowToneValue === 'up'
      ? styles.symbolCardFlowUp
      : flowToneValue === 'down'
        ? styles.symbolCardFlowDown
        : undefined;
  const last = quote?.last ?? row?.last ?? null;
  const pct = quote?.pct ?? row?.pct ?? null;
  const comment = row?.latest_comment ?? null;
  return (
    <Card link className="symbol-card" href={`/symbol/${encodeURIComponent(symbol)}`}>
      <div className={`symbol-card-head ${stylex.props(styles.symbolCardHead).className}`}>
        <span className={`sym ${stylex.props(styles.symbolCardSymbol).className}`}>
          {symbol.replace(/\.US$/, '')}
        </span>
        {row?.direction && (
          <Badge tone={directionTone(row.direction)}>{DIRECTION_LABEL[row.direction]}</Badge>
        )}
        {last != null && (
          <span className={`quote ${stylex.props(styles.symbolCardQuote).className}`}>
            {fmt(last)}
            {pct != null && (
              <>
                {' '}
                <Num value={pct} diff suffix="%" />
              </>
            )}
          </span>
        )}
        {quote && quote.session !== '日盘' && <Badge className="qc-session">{quote.session}</Badge>}
        {owned && (
          <Badge className={`hold-badge ${stylex.props(styles.holdBadge).className}`}>持仓</Badge>
        )}
        {earningsDate && (
          <Badge tone="accent" className="earnings-badge">
            财报 {earningsDate.slice(5)}
          </Badge>
        )}
        {row && <FollowToggle symbol={symbol} initialFollowing={row.ai_following} />}
        {row?.prediction_stale && <Dot tone="accent" title="预测已过期" />}
        {row && row.alert_count > 0 && (
          <Badge
            tone="down"
            className={`unread-badge ${stylex.props(styles.unreadBadge).className}`}
          >
            {row.alert_count}
          </Badge>
        )}
      </div>
      <div className={`symbol-card-levels ${stylex.props(styles.symbolCardLevels).className}`}>
        <span
          className={flowStyle ? stylex.props(flowStyle).className : undefined}
        >
          {fmtFlowLabeled(flow)}
        </span>
        {row && <span>止损 {pctCell(row.stop_distance_pct)}</span>}
        {row && <span>目标1 {pctCell(row.target1_distance_pct)}</span>}
        {row && <ReassessButton symbol={symbol} />}
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

function TailCell({ entry }: { entry: GridEntry }) {
  const pct = entry.quote?.pct ?? null;
  const tone = flowTone(entry.flow);
  return (
    <a
      className={`watch-tail-cell ${stylex.props(styles.watchTailCell).className}`}
      href={`/symbol/${encodeURIComponent(entry.symbol)}`}
    >
      <span className={`sym ${stylex.props(styles.tailSymbol).className}`}>
        {entry.symbol.replace(/\.US$/, '')}
      </span>
      {pct != null && <Num value={pct} diff suffix="%" />}
      {entry.flow != null && (
        <span
          className={`num tail-flow ${
            stylex.props(
              styles.tailFlow,
              tone === 'up' && styles.tailFlowUp,
              tone === 'down' && styles.tailFlowDown,
            ).className
          }`}
        >
          {fmtFlow(entry.flow)}
        </span>
      )}
      {entry.earningsDate && (
        <Badge tone="accent" className="earnings-badge">
          财报 {entry.earningsDate.slice(5)}
        </Badge>
      )}
    </a>
  );
}

export function SymbolGrid(props: {
  quotes: QuoteCell[];
  board: OverviewBoard | null;
  portfolio: PortfolioSummary | null;
  events: HomeEvents | null;
}) {
  const entries = buildGridEntries(props);
  if (!entries.length) {
    return <Empty>自选和持仓还是空的——去长桥加自选，或在 cockpit 跑一次分析</Empty>;
  }
  const cards = entries.filter((e) => e.row != null || e.owned);
  const tail = entries.filter((e) => e.row == null && !e.owned);
  const today = props.events?.date ?? null;
  const movers = tail.filter((e) => isMover(e, today));
  const quiet = tail.filter((e) => !isMover(e, today));
  return (
    <>
      {cards.length > 0 && (
        <div className={`overview-grid ${stylex.props(styles.overviewGrid).className}`}>
          {cards.map((entry) => (
            <GridCard key={entry.symbol} entry={entry} />
          ))}
        </div>
      )}
      <MoverTail movers={movers} quiet={quiet} />
    </>
  );
}

function MoverTail({ movers, quiet }: { movers: GridEntry[]; quiet: GridEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!movers.length && !quiet.length) return null;
  return (
    <div className={`watch-tail ${stylex.props(styles.watchTail).className}`}>
      {movers.map((entry) => (
        <TailCell key={entry.symbol} entry={entry} />
      ))}
      {quiet.length > 0 && (
        <button
          type="button"
          className={`watch-tail-fold ${stylex.props(styles.tailFold).className}`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起 ▴' : `+ ${quiet.length} 只平静 ▾`}
        </button>
      )}
      {expanded && quiet.map((entry) => <TailCell key={entry.symbol} entry={entry} />)}
    </div>
  );
}
