import { useEffect, useState } from "react";
import type { ChartMeta, OverviewBoard, PortfolioSummary } from "../../../shared/types";
import { marketDate } from "../../../shared/time";
import { useQuery } from "../apiHooks";
import { client } from "../client";
import { navigate, useQueryParam } from "../router";
import { QuoteBar } from "../QuoteBar";
import { Badge, Chip, ErrorBox, SectionTitle } from "../ui";
import { useTitle } from "../useTitle";
import { useSSE } from "../useSSE";
import { useIntervalFetch } from "./cockpit/useIntervalFetch";
import { CROSS_SECTION_TYPES, CrossSectionCharts, MAX_VISIBLE_DATES } from "./home/CrossSectionCharts";
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

  const dateParam = useQueryParam("date");
  const today = marketDate();
  const date = dateParam ?? today;
  const isToday = date === today;

  const [board, setBoard] = useState<OverviewBoard | null>(null);
  const { degraded: boardDegraded } = useSSE<OverviewBoard>({ kind: "board" }, setBoard);
  const boardError = boardDegraded ? "盘面数据获取失败，正在重试" : null;
  const { data: portfolio, error: portfolioError } = useIntervalFetch<PortfolioSummary>(
    isToday ? "positions.list" : null,
    () => client.positions.list(),
    60_000,
  );

  const { data: chartMetas } = useQuery<ChartMeta[]>(`charts.list:${CROSS_SECTION_TYPES}`, () =>
    client.charts.list({ type: CROSS_SECTION_TYPES }),
  );
  const { data: recapDates } = useQuery<string[]>("overview.recapDates", () => client.overview.recapDates());
  const candidateDates = [
    ...new Set([today, ...(chartMetas ?? []).map((m) => marketDate(m.created_at)), ...(recapDates ?? [])]),
  ]
    .sort()
    .reverse();
  const visibleDates = candidateDates.slice(0, MAX_VISIBLE_DATES);
  const switcherDates = visibleDates.includes(date) ? visibleDates : [date, ...visibleDates].slice(0, MAX_VISIBLE_DATES);

  const session = board?.session ?? null;
  const trading = isToday && (session === "pre" || session === "regular");
  const watching = new Set(board?.rows.map((r) => r.symbol) ?? []);
  const shortcuts = [...new Set([...watching, ...(portfolio?.positions.map((p) => p.symbol) ?? [])])];

  return (
    <div className="page home-page">
      <h1>盘面 {isToday && session && <Badge className="session-tag">{SESSION_LABEL[session] ?? session}</Badge>}</h1>
      <div className="sub">
        {isToday ? `${board?.date ?? ""} · 盘中看盘、盘后复盘，随时段自动切换` : `${date} · 历史复盘`}
      </div>
      {notice && NOTICE_LABEL[notice] && <ErrorBox>{NOTICE_LABEL[notice]}</ErrorBox>}
      {isToday && <QuoteBar />}
      <QuickBar shortcuts={shortcuts} />
      {switcherDates.length > 0 && (
        <div className="cross-section-switcher">
          {switcherDates.map((d) => (
            <Chip key={d} active={d === date} onClick={() => navigate(`/?date=${d}`, { replace: true })}>
              {d}
            </Chip>
          ))}
        </div>
      )}
      {isToday && !board && !boardError && <div className="note-block">盘面加载中…</div>}
      {isToday && boardError && !board && <ErrorBox>{boardError}</ErrorBox>}
      {(!isToday || board) && (
        <div className="home-grid">
          <div className="home-main">
            {trading ? (
              <>
                <SectionTitle>看盘</SectionTitle>
                <WatchBoard board={board!} error={boardError} compact={false} />
                <CrossSectionCharts date={date} />
              </>
            ) : (
              <RecapBoard date={date} defaultExpanded />
            )}
          </div>
          <div className="home-side">
            {trading ? (
              <>
                <SectionTitle>持仓</SectionTitle>
                <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
                <RecapBoard date={date} defaultExpanded={false} />
              </>
            ) : isToday ? (
              <>
                <SectionTitle>看盘（定格）</SectionTitle>
                <WatchBoard board={board!} error={boardError} compact />
                <SectionTitle>持仓</SectionTitle>
                <PositionsCard portfolio={portfolio} error={portfolioError} watching={watching} />
                <CrossSectionCharts date={date} />
              </>
            ) : (
              <CrossSectionCharts date={date} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
