import { useState } from "react";
import type { IntradayBuilt, TimeframeKey } from "../../../../shared/types";
import { formatMarketDateTime } from "../../../../shared/time";
import { fmt } from "../../format";
import type { SidebarTab } from "../SidebarTabs";
import { SidebarTabs } from "../SidebarTabs";
import { ConclusionCard } from "./ConclusionCard";
import { NewsTab } from "./tabs/NewsTab";
import { PositionTab } from "./tabs/PositionTab";
import { PredictionTab } from "./tabs/PredictionTab";

interface IntradaySidebarProps {
  built: IntradayBuilt;
  activeTf: TimeframeKey;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  tabsOverride?: SidebarTab[];
  active?: string;
  onActiveChange?: (key: string) => void;
}

export function IntradaySidebar({
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  tabsOverride,
  active: activeProp,
  onActiveChange,
}: IntradaySidebarProps) {
  const s = built.sidebar;
  const [internalActive, setInternalActive] = useState("prediction");
  const active = activeProp ?? internalActive;
  const setActive = onActiveChange ?? setInternalActive;

  const hasNews = Boolean(s.context?.news?.length) || Boolean(s.news?.length);
  const hasPosition = s.position !== null;

  const tabs: SidebarTab[] = tabsOverride ?? [
    {
      key: "prediction",
      label: "预测",
      content: (
        <PredictionTab
          built={built}
          activeTf={activeTf}
          predictionUpdatedAt={predictionUpdatedAt}
          predictionStale={predictionStale}
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

  return (
    <div className="sidebar">
      <div className="header">
        <div className="symbol">{s.symbol}</div>
        <div className="name">{s.name}</div>
        <div className="price">${fmt(s.last)}</div>
        <div className="price-date">{s.asOf ? formatMarketDateTime(s.asOf) : ""} · 长桥证券</div>
      </div>

      <ConclusionCard context={s.context} predictionStale={predictionStale} />

      <SidebarTabs active={active} onChange={setActive} tabs={tabs} />

      <div className="disclaimer">
        ⚠️ 仅供学习参考，不构成投资建议。数据来源：长桥证券。
        <br />
        方向判断、情景推演、入场计划、Pin Bar/MACD 背离标注均为 AI 分析结论；MACD 数值本身由脚本计算。
      </div>
    </div>
  );
}
