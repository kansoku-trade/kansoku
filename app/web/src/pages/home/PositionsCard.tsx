import type { PortfolioSummary } from "../../../../shared/types";
import { fmt, signed, upDown } from "../../format";

function signedMoney(value: number): string {
  const sign = value < 0 ? "−" : "+";
  return `${sign}$${Math.abs(value).toFixed(1)}`;
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
  if (error) return <div className="error-box">持仓拉取失败：{error}</div>;
  if (!portfolio) return <div className="note-block">持仓加载中…</div>;

  return (
    <div className="positions-card">
      <div className="positions-summary">
        <span>
          今日 <b className={upDown(portfolio.today_pl)}>{signedMoney(portfolio.today_pl)}</b>
        </span>
        <span>
          总盈亏 <b className={upDown(portfolio.total_pl)}>{signedMoney(portfolio.total_pl)}</b>
        </span>
        <span>
          市值 <b>${portfolio.market_cap.toFixed(0)}</b>
        </span>
        <span>
          现金 <b>${portfolio.cash.toFixed(0)}</b>
        </span>
      </div>
      {portfolio.positions.map((p) => (
        <div key={p.symbol} className="positions-row">
          <span className="sym">
            {watching.has(p.symbol) && <span className="watch-dot" title="今日跟踪中" />}
            {p.symbol.replace(/\.US$/, "")}
          </span>
          <span className="detail">
            {p.quantity} 股 @ {fmt(p.cost_price)}
          </span>
          <span className="last">{fmt(p.last)}</span>
          <span className={upDown(p.pnl_pct)}>{signed(p.pnl_pct)}%</span>
        </div>
      ))}
    </div>
  );
}
