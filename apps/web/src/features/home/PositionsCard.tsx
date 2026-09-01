import type { PortfolioSummary } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { fmt, money, signed, upDown } from '@web/lib/format';
import { Card, Dot, ErrorBox, NoteBlock } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  card: {
    padding: '10px 12px',
  },
  summary: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    color: colors.textSecondary,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
    gap: '12px',
    paddingBottom: '8px',
  },
  summaryValue: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  list: {
    alignItems: 'baseline',
    color: colors.textSecondary,
    columnGap: '12px',
    display: 'grid',
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
    gridTemplateColumns: 'max-content 1fr max-content max-content',
    paddingTop: '7px',
    rowGap: '7px',
  },
  row: {
    display: 'contents',
  },
  symbol: {
    color: colors.textPrimary,
    fontWeight: 600,
    textDecoration: {
      'default': 'none',
      ':hover': 'underline',
    },
    textUnderlineOffset: '3px',
    ':hover': {
      color: colors.accent,
    },
  },
  last: {
    color: colors.textPrimary,
    textAlign: 'right',
  },
  pct: {
    textAlign: 'right',
  },
  up: {
    color: colors.up,
  },
  down: {
    color: colors.down,
  },
  dot: {
    marginRight: '6px',
  },
});

function signedMoney(value: number): string {
  const sign = value < 0 ? '−' : '+';
  return `${sign}$${fmt(Math.abs(value), 1)}`;
}

export function PositionsCard({
  portfolio,
  error,
  watching,
}: {
  portfolio: PortfolioSummary | null;
  error: string | null;
  watching: Set<string>;
}) {
  if (error) return <ErrorBox>持仓拉取失败：{error}</ErrorBox>;
  if (!portfolio) return <NoteBlock>持仓加载中…</NoteBlock>;

  return (
    <Card className={`positions-card ${stylex.props(styles.card).className}`}>
      <div className={`positions-summary ${stylex.props(styles.summary).className}`}>
        <span>
          今日{' '}
          <b
            className={`${
              stylex.props(
                styles.summaryValue,
                upDown(portfolio.today_pl) === 'up' ? styles.up : styles.down,
              ).className
            }`}
          >
            {signedMoney(portfolio.today_pl)}
          </b>
        </span>
        <span>
          总盈亏{' '}
          <b
            className={`${
              stylex.props(
                styles.summaryValue,
                upDown(portfolio.total_pl) === 'up' ? styles.up : styles.down,
              ).className
            }`}
          >
            {signedMoney(portfolio.total_pl)}
          </b>
        </span>
        <span>
          市值{' '}
          <b className={stylex.props(styles.summaryValue).className}>
            {money(portfolio.market_cap, 0)}
          </b>
        </span>
        <span>
          现金{' '}
          <b className={stylex.props(styles.summaryValue).className}>{money(portfolio.cash, 0)}</b>
        </span>
      </div>
      <div className={`positions-list ${stylex.props(styles.list).className}`}>
        {portfolio.positions.map((p) => (
          <div key={p.symbol} className={`positions-row ${stylex.props(styles.row).className}`}>
            <a
              className={`sym ${stylex.props(styles.symbol).className}`}
              href={`/symbol/${encodeURIComponent(p.symbol)}`}
            >
              {watching.has(p.symbol) && (
                <Dot className={stylex.props(styles.dot).className} title="今日跟踪中" />
              )}
              {p.symbol.replace(/\.US$/, '')}
            </a>
            <span className="detail">
              {p.quantity} 股 @ {fmt(p.cost_price)}
            </span>
            <span className={`last ${stylex.props(styles.last).className}`}>{fmt(p.last)}</span>
            <span
              className={`pct ${
                stylex.props(styles.pct, upDown(p.pnl_pct) === 'up' ? styles.up : styles.down)
                  .className
              }`}
            >
              {signed(p.pnl_pct)}%
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
