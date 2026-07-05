import { useState } from "react";
import type { QuoteCell, QuoteSnapshot } from "../../shared/types";
import { signed, upDown } from "./format";
import { useSSE } from "./useSSE";

function Cell({ q }: { q: QuoteCell }) {
  return (
    <div className="quote-cell">
      <span className="qc-symbol">{q.symbol.replace(/\.US$/, "")}</span>
      <span className={`qc-price ${upDown(q.pct)}`}>${q.last < 10 ? q.last.toFixed(3) : q.last.toFixed(2)}</span>
      <span className={`qc-pct ${upDown(q.pct)}`}>{signed(q.pct)}%</span>
      {q.session !== "日盘" && <span className="qc-session">{q.session}</span>}
    </div>
  );
}

export function QuoteBar() {
  const [snap, setSnap] = useState<QuoteSnapshot | null>(null);
  const { degraded } = useSSE<QuoteSnapshot>("/api/stream/quotes", setSnap);
  const quotes = snap?.quotes ?? [];

  return (
    <div className="quote-bar">
      {degraded && <span className="degraded-dot" title="数据延迟：行情拉取失败，正在重试" />}
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

export function TopbarQuote({ symbol }: { symbol: string }) {
  const [snap, setSnap] = useState<QuoteSnapshot | null>(null);
  useSSE<QuoteSnapshot>(`/api/stream/quotes?extra=${encodeURIComponent(symbol)}`, setSnap);
  const q = snap?.quotes.find((x) => x.symbol === symbol);
  if (!q) return null;

  return (
    <span className="topbar-quote">
      <span className={`qc-price ${upDown(q.pct)}`}>${q.last.toFixed(2)}</span>
      <span className={`qc-pct ${upDown(q.pct)}`}>{signed(q.pct)}%</span>
      <span className="qc-session">{q.session}</span>
    </span>
  );
}
