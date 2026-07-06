import { useEffect, useState } from "react";
import type { OverviewBoard, PortfolioSummary } from "../../../shared/types";
import { navigate, useQueryParam } from "../router";
import { QuoteBar } from "../QuoteBar";
import { Badge, ErrorBox, SectionTitle } from "../ui";
import { useTitle } from "../useTitle";
import { useSSE } from "../useSSE";
import { useIntervalFetch } from "./cockpit/useIntervalFetch";
import { CrossSectionCharts } from "./home/CrossSectionCharts";
import { PositionsCard } from "./home/PositionsCard";
import { QuickBar } from "./home/QuickBar";
import { RecapBoard } from "./home/RecapBoard";
import { WatchBoard } from "./home/WatchBoard";

const SESSION_LABEL: Record<string, string> = { pre: "盘前", regular: "盘中", post: "盘后", overnight: "休市" };
const NOTICE_LABEL: Record<string, string> = { "chart-not-found": "该图表不存在，已为你返回首页" };

export function Home() {
  useTitle(null);
  const noticeParam = useQueryParam("notice");
  const [notice] = useState(noticeParam);
  useEffect(() => {
    if (noticeParam) navigate("/", { replace: true });
  }, [noticeParam]);
  const [board, setBoard] = useState<OverviewBoard | null>(null);
  const { degraded: boardDegraded } = useSSE<OverviewBoard>({ kind: "board" }, setBoard);
  const boardError = boardDegraded ? "盘面数据获取失败，正在重试" : null;
  const { data: portfolio, error: portfolioError } = useIntervalFetch<PortfolioSummary>("/api/positions", 60_000);

  const session = board?.session ?? null;
  const trading = session === "pre" || session === "regular";
  const watching = new Set(board?.rows.map((r) => r.symbol) ?? []);
  const shortcuts = [...new Set([...watching, ...(portfolio?.positions.map((p) => p.symbol) ?? [])])];

  return (
    <div className="page home-page">
      <h1>盘面 {session && <Badge className="session-tag">{SESSION_LABEL[session] ?? session}</Badge>}</h1>
      <div className="sub">{board?.date ?? ""} · 盘中看盘、盘后复盘，随时段自动切换</div>
      {notice && NOTICE_LABEL[notice] && <ErrorBox>{NOTICE_LABEL[notice]}</ErrorBox>}
      <QuoteBar />
      <QuickBar shortcuts={shortcuts} />
      {!board && !boardError && <div className="note-block">盘面加载中…</div>}
      {boardError && !board && <ErrorBox>{boardError}</ErrorBox>}
      {board && (
      <div className="home-grid">
        <div className="home-main">
          {trading ? (
            <>
              <SectionTitle>看盘</SectionTitle>
              <WatchBoard board={board} error={boardError} compact={false} />
              <CrossSectionCharts />
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
              <SectionTitle>持仓</SectionTitle>
              <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
              <RecapBoard defaultExpanded={false} />
            </>
          ) : (
            <>
              <SectionTitle>看盘（定格）</SectionTitle>
              <WatchBoard board={board} error={boardError} compact />
              <SectionTitle>持仓</SectionTitle>
              <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
              <CrossSectionCharts />
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
