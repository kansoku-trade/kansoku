import { useState } from 'react';
import type { QuoteCell, QuoteSnapshot } from '@kansoku/shared/types';
import { money, signed, upDown } from '../../lib/format';
import { marketOfSymbol } from '../../lib/market';
import { useWsChannel } from '../../lib/ws/useWsChannel';
import { Badge, DataAgeBadge, Dot, MarketTime } from '../../ui';

function pctTone(pct: number | null): string {
  return pct == null ? '' : upDown(pct);
}

function pctText(pct: number | null): string {
  return pct == null ? '—' : `${signed(pct)}%`;
}

function Cell({ q }: { q: QuoteCell }) {
  return (
    <a className="quote-cell" href={`/symbol/${encodeURIComponent(q.symbol)}`}>
      <span className="qc-symbol">{q.symbol.replace(/\.US$/, '')}</span>
      <span className={`num qc-price ${pctTone(q.pct)}`}>
        {money(q.last, q.last < 10 ? 3 : 2)}
      </span>
      <span className={`num qc-pct ${pctTone(q.pct)}`}>{pctText(q.pct)}</span>
      {q.session !== '日盘' && <Badge className="qc-session">{q.session}</Badge>}
    </a>
  );
}

export function QuoteBar() {
  const [snap, setSnap] = useState<QuoteSnapshot | null>(null);
  const { degraded, snapshotAt } = useWsChannel<QuoteSnapshot>({ kind: 'quotes' }, setSnap);
  const quotes = snap?.quotes ?? [];

  return (
    <div className="quote-bar">
      <DataAgeBadge at={snapshotAt} />
      {degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
      {quotes.length === 0 ? (
        <div className="quote-cell quote-placeholder">行情连接中…</div>
      ) : (
        <div className="quote-marquee">
          <div className="quote-track" style={{ animationDuration: `${quotes.length * 5}s` }}>
            {[0, 1].map((dup) => (
              <div className="quote-seg" key={dup} aria-hidden={dup === 1}>
                {quotes.map((q) => (
                  <Cell key={q.symbol} q={q} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
      />
    </span>
  );
}
