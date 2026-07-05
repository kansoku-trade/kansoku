import type { OverviewBoard, PortfolioSummary } from "../../../shared/types";
import { QuoteBar } from "../QuoteBar";
import { useIntervalFetch } from "./cockpit/useIntervalFetch";
import { PositionsCard } from "./home/PositionsCard";
import { QuickBar } from "./home/QuickBar";
import { RecapBoard } from "./home/RecapBoard";
import { TodayCharts } from "./home/TodayCharts";
import { WatchBoard } from "./home/WatchBoard";

const SESSION_LABEL: Record<string, string> = { pre: "盘前", regular: "盘中", post: "盘后", overnight: "休市" };

export function Home() {
  const { data: board, error: boardError } = useIntervalFetch<OverviewBoard>("/api/overview", 30_000);
  const { data: portfolio, error: portfolioError } = useIntervalFetch<PortfolioSummary>("/api/positions", 60_000);

  const session = board?.session ?? null;
  const trading = session === "pre" || session === "regular";
  const watching = new Set(board?.rows.map((r) => r.symbol) ?? []);
  const shortcuts = [...new Set([...watching, ...(portfolio?.positions.map((p) => p.symbol) ?? [])])];

  return (
    <div className="page home-page">
      <h1>
        盘面 {session && <span className="session-tag">{SESSION_LABEL[session] ?? session}</span>}
      </h1>
      <div className="sub">{board?.date ?? ""} · 盘中看盘、盘后复盘，随时段自动切换</div>
      <QuoteBar />
      <QuickBar shortcuts={shortcuts} />
      {!board && !boardError && <div className="note-block">盘面加载中…</div>}
      {boardError && !board && <div className="error-box">{boardError}</div>}
      {board && (
      <div className="home-grid">
        <div className="home-main">
          {trading ? (
            <>
              <div className="section-title">看盘</div>
              <WatchBoard board={board} error={boardError} compact={false} />
              <TodayCharts date={board?.date ?? null} />
            </>
          ) : (
            <>
              <RecapBoard defaultExpanded />
            </>
          )}
        </div>
        <div className="home-side">
          {trading ? (
            <>
              <div className="section-title">持仓</div>
              <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
              <RecapBoard defaultExpanded={false} />
            </>
          ) : (
            <>
              <div className="section-title">看盘（定格）</div>
              <WatchBoard board={board} error={boardError} compact />
              <div className="section-title">持仓</div>
              <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
              <TodayCharts date={board?.date ?? null} />
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
