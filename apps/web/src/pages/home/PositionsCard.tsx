import type { PortfolioSummary } from "@kansoku/shared/types";
import { fmt, signed, upDown } from "@web/format";
import { Card, Dot, ErrorBox } from "@web/ui";

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
  if (error) return <ErrorBox>持仓拉取失败：{error}</ErrorBox>;
  if (!portfolio) return <div className="note-block">持仓加载中…</div>;

  return (
    <Card className="positions-card">
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
      <div className="positions-list">
        {portfolio.positions.map((p) => (
          <div key={p.symbol} className="positions-row">
            <a className="sym" href={`/symbol/${encodeURIComponent(p.symbol)}`}>
              {watching.has(p.symbol) && <Dot title="今日跟踪中" />}
              {p.symbol.replace(/\.US$/, "")}
            </a>
            <span className="detail">
              {p.quantity} 股 @ {fmt(p.cost_price)}
            </span>
            <span className="last">{fmt(p.last)}</span>
            <span className={`pct ${upDown(p.pnl_pct)}`}>{signed(p.pnl_pct)}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
