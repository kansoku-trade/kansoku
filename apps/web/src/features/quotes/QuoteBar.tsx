import type { QuoteCell } from '@kansoku/shared/types';
import { money, signed, upDown } from '../../lib/format';
import { marketOfSymbol } from '../../lib/market';
import { Badge, MarketTime } from '../../ui';

function pctTone(pct: number | null): string {
  return pct == null ? '' : upDown(pct);
}

function pctText(pct: number | null): string {
  return pct == null ? '—' : `${signed(pct)}%`;
}

export function TopbarQuote({ quote }: { quote: QuoteCell | null }) {
  if (!quote) return null;

  return (
    <span className="topbar-quote">
      <span className={`num qc-price ${pctTone(quote.pct)}`}>{money(quote.last)}</span>
      <span className={`num qc-pct ${pctTone(quote.pct)}`}>{pctText(quote.pct)}</span>
      <Badge className="qc-session">{quote.session}</Badge>
      <MarketTime
        className="topbar-quote-time"
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
