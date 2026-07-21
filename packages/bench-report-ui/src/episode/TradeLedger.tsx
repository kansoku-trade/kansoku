import type { EpisodeReportTradeLedgerItem } from '../types';
import { Disclosure, MoreText } from '../ui/Disclosure';
import { fmt, fmtSigned } from './format';

function PriceCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function TradeLedger({
  trades,
  activeTradeId,
  onToggle,
}: {
  trades: EpisodeReportTradeLedgerItem[];
  activeTradeId: number | null;
  onToggle: (tradeId: number) => void;
}) {
  if (trades.length === 0) {
    return (
      <section className="trade-ledger">
        <h4>交易明细</h4>
        <p className="ledger-hint">该 Episode 全程没有成交。</p>
      </section>
    );
  }

  return (
    <section className="trade-ledger">
      <Disclosure
        defaultOpen
        summary={
          <h4>
            交易明细 <span>{trades.length}</span>
          </h4>
        }
      >
        <p className="ledger-hint">点击任意一笔，在图表高亮该次决策 K 线并显示该笔实际价位</p>
        <ol>
          {trades.map((trade) => {
            const active = activeTradeId === trade.tradeId;
            const stopText =
              trade.finalStop === trade.initialStop
                ? fmt(trade.initialStop)
                : `${fmt(trade.initialStop)} → ${fmt(trade.finalStop)}`;
            return (
              <li key={trade.tradeId}>
                <button
                  type="button"
                  data-trade-select=""
                  data-trade-id={trade.tradeId}
                  aria-pressed={active}
                  className={active ? 'tl-select active' : 'tl-select'}
                  onClick={() => onToggle(trade.tradeId)}
                >
                  <span className="tl-head">
                    <strong>
                      T{trade.tradeId} · {trade.directionLabel}
                    </strong>
                    <strong className={trade.tone}>{fmtSigned(trade.netR, 3)} R</strong>
                  </span>
                  <span className="tl-bars">
                    B{trade.decisionBar} 决策 ·{' '}
                    {trade.entryBar == null ? '—' : `B${trade.entryBar}`} →{' '}
                    {trade.exitBar == null ? '—' : `B${trade.exitBar}`} · {trade.exitLabel}
                  </span>
                </button>
                <dl className="tl-prices">
                  <PriceCell label="E" value={fmt(trade.entryPrice)} />
                  <PriceCell label="S" value={stopText} />
                  <PriceCell label="T" value={fmt(trade.target)} />
                  <PriceCell label="X" value={fmt(trade.exitPrice)} />
                </dl>
                {trade.entryReasonCategoryLabel ? (
                  <div className="tl-reason">
                    <b>{trade.entryReasonCategoryLabel}</b>
                    <MoreText text={trade.entryReasonSummary ?? ''} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Disclosure>
    </section>
  );
}
