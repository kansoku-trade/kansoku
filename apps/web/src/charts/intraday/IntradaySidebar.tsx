import { useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import type { IntradayBuilt, QuoteCell, TimeframeKey } from "@kansoku/shared/types";
import { fmt } from "@web/format";
import { marketOfSymbol } from "@web/lib/market";
import { MarketTime } from "@web/ui";
import type { SidebarTab } from "../SidebarTabs";
import { SidebarTabs } from "../SidebarTabs";
import { ConclusionCard, type ConclusionReassess } from "./ConclusionCard";
import { EventRiskCard } from "./EventRiskCard";
import { NewsTab } from "./tabs/NewsTab";
import { PositionTab } from "./tabs/PositionTab";
import { PredictionTab } from "./tabs/PredictionTab";

interface IntradaySidebarProps {
  built: IntradayBuilt;
  activeTf: TimeframeKey;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  conclusionReassess?: ConclusionReassess;
  tabsOverride?: SidebarTab[];
  extraTabs?: SidebarTab[];
  active?: string;
  onActiveChange?: (key: string) => void;
  dock?: ReactNode;
  liveQuote?: QuoteCell | null;
}

export function resolveSidebarQuote(sidebar: IntradayBuilt["sidebar"], liveQuote?: QuoteCell | null) {
  const current = liveQuote?.symbol === sidebar.symbol ? liveQuote : null;
  return {
    last: current?.last ?? sidebar.last,
    asOf: current?.asOf ?? sidebar.asOf,
  };
}

export function IntradaySidebar({
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  conclusionReassess,
  tabsOverride,
  extraTabs,
  active: activeProp,
  onActiveChange,
  dock,
  liveQuote,
}: IntradaySidebarProps) {
  const s = built.sidebar;
  const market = marketOfSymbol(s.symbol);
  const displayedQuote = resolveSidebarQuote(s, liveQuote);
  const [internalActive, setInternalActive] = useState("prediction");
  const active = activeProp ?? internalActive;
  const setActive = onActiveChange ?? setInternalActive;

  const hasNews = Boolean(s.context?.news?.length) || Boolean(s.news?.length);
  const hasPosition = s.position !== null;

  const defaultTabs: SidebarTab[] = [
    {
      key: "prediction",
      label: "预测",
      content: (
        <PredictionTab
          built={built}
          activeTf={activeTf}
          predictionUpdatedAt={predictionUpdatedAt}
          predictionStale={predictionStale}
          reassess={conclusionReassess}
        />
      ),
    },
    {
      key: "news",
      label: "消息",
      hidden: !hasNews,
      content: <NewsTab context={s.context} news={s.news ?? []} />,
    },
    {
      key: "position",
      label: "持仓",
      hidden: !hasPosition,
      content: <PositionTab position={s.position} />,
    },
  ];
  const tabs = tabsOverride ?? [...defaultTabs, ...(extraTabs ?? [])];

  return (
    <div className="sidebar">
      <div className="sidebar-scroll">
        <div className="header">
          <div className="symbol">{s.symbol}</div>
          <div className="name">{s.name}</div>
          <div className="price">${fmt(displayedQuote.last)}</div>
          <div className="price-date">
            {displayedQuote.asOf ? <MarketTime value={displayedQuote.asOf} market={market} /> : ""} · 长桥证券
          </div>
        </div>

        <ConclusionCard context={s.context} predictionStale={predictionStale} reassess={conclusionReassess} />

        <EventRiskCard eventRisk={s.eventRisk} />

        <SidebarTabs active={active} onChange={setActive} tabs={tabs} />

        <div className="disclaimer">
          <TriangleAlert className="icon" size={12} /> 仅供学习参考，不构成投资建议。数据来源：长桥证券。
          <br />
          方向判断、情景推演、入场计划、Pin Bar/MACD 背离标注均为 AI 分析结论；MACD 数值本身由脚本计算。
        </div>
      </div>

      {dock}
    </div>
  );
}
