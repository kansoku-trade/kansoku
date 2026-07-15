import { useState } from "react";
import type { QuoteCell, QuoteSnapshot } from "../../shared/types";
import { signed, upDown } from "./format";
import { useWsChannel } from "./useWsChannel";
import { Badge, DataAgeBadge, Dot } from "./ui";

function Cell({ q }: { q: QuoteCell }) {
  return (
    <a className="quote-cell" href={`/symbol/${encodeURIComponent(q.symbol)}`}>
      <span className="qc-symbol">{q.symbol.replace(/\.US$/, "")}</span>
      <span className={`num qc-price ${upDown(q.pct)}`}>${q.last < 10 ? q.last.toFixed(3) : q.last.toFixed(2)}</span>
      <span className={`num qc-pct ${upDown(q.pct)}`}>{signed(q.pct)}%</span>
      {q.session !== "日盘" && <Badge className="qc-session">{q.session}</Badge>}
    </a>
  );
}

export function QuoteBar() {
  const [snap, setSnap] = useState<QuoteSnapshot | null>(null);
  const { degraded, snapshotAt } = useWsChannel<QuoteSnapshot>({ kind: "quotes" }, setSnap);
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
      <span className={`num qc-price ${upDown(quote.pct)}`}>${quote.last.toFixed(2)}</span>
      <span className={`num qc-pct ${upDown(quote.pct)}`}>{signed(quote.pct)}%</span>
      <Badge className="qc-session">{quote.session}</Badge>
    </span>
  );
}
