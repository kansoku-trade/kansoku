import * as stylex from '@stylexjs/stylex';
import { money, signed, upDown } from '../../lib/format';
import { marketOfSymbol } from '../../lib/market';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { Badge, MarketTime } from '../../ui';
import { useLiveQuote } from './useLiveQuote';

const styles = stylex.create({
  root: {
    alignItems: 'baseline',
    display: 'inline-flex',
    flex: '1 1 auto',
    fontSize: fontSizes.md,
    gap: '6px',
    minWidth: 0,
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
  time: {
    color: colors.textBright,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    marginLeft: 'auto',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
});

function pctTone(pct: number | null): string {
  return pct == null ? '' : upDown(pct);
}

function pctText(pct: number | null): string {
  return pct == null ? '—' : `${signed(pct)}%`;
}

export function TopbarQuote({ sym }: { sym: string }) {
  const quote = useLiveQuote(sym);
  if (!quote) return null;

  const tone = pctTone(quote.pct);
  const numberClassName = stylex.props(
    styles.number,
    tone === 'up' ? styles.up : tone === 'down' ? styles.down : undefined,
  ).className;

  return (
    <span {...stylex.props(styles.root)}>
      <span className={`num${numberClassName ? ` ${numberClassName}` : ''}`}>
        {money(quote.last)}
      </span>
      <span className={`num${numberClassName ? ` ${numberClassName}` : ''}`}>
        {pctText(quote.pct)}
      </span>
      <Badge className="qc-session">{quote.session}</Badge>
      <MarketTime
        className={stylex.props(styles.time).className}
        value={quote.asOf || 0}
        live
        format="clock-seconds"
        includeZone
        market={marketOfSymbol(quote.symbol)}
        zone="market"
      />
    </span>
  );
}
