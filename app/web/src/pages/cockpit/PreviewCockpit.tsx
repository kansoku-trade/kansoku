import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { IntradayDashboard, IntradayTimeframeSwitch } from "../../charts/intraday/IntradayDashboard";
import { resolveIntradayTf } from "../../charts/intraday/useIntradayDoc";
import { useIntradayPreview } from "../../charts/intraday/useIntradayPreview";
import type { SidebarTab } from "../../charts/SidebarTabs";
import { TopbarQuote } from "../../QuoteBar";
import { Dot, Empty, ErrorBox } from "../../ui";
import { useTitle } from "../../useTitle";
import { GenerateAnalysis } from "./GenerateAnalysis";
import { buildSharedSidebarTabs } from "./sharedSidebarTabs";
import { useAiUnreadBadge } from "./useAiUnreadBadge";
import { useCockpitComments } from "./useCockpitComments";
import { useCockpitEnv } from "./useCockpitEnv";
import { useCockpitReviewState } from "./useCockpitReviewState";

export function PreviewCockpit({ sym }: { sym: string }) {
  const symLabel = sym.toUpperCase().replace(/\.US$/, "");
  const { built, error, degraded, intradayTf, setIntradayTf } = useIntradayPreview(sym);
  useTitle(symLabel);

  const env = useCockpitEnv(sym);
  const { journalEntries, reviewSection, setReviewSection, selectedJournal, setSelectedJournal } =
    useCockpitReviewState(sym);
  const [activeTab, setActiveTab] = useState("prediction");
  const { comments, error: commentsError, loaded: commentsLoaded } = useCockpitComments(sym);
  const { unread } = useAiUnreadBadge(sym, comments, commentsLoaded, activeTab);

  if (error) {
    return (
      <div className="page">
        <ErrorBox>{error}</ErrorBox>
        <p>
          <a href="/">
            <ArrowLeft className="icon" size={13} /> 返回列表
          </a>
        </p>
      </div>
    );
  }

  if (!built)
    return (
      <div className="page">
        <Empty>加载中…</Empty>
      </div>
    );

  const activeIntradayTf = resolveIntradayTf(built, intradayTf);

  const sidebarTabs: SidebarTab[] = [
    {
      key: "prediction",
      label: "预测",
      content: (
        <>
          <Empty>这只股票还没有 AI 分析——先看实时走势，也可以直接生成一份</Empty>
          <GenerateAnalysis sym={sym} />
        </>
      ),
    },
    ...buildSharedSidebarTabs({
      sym,
      sidebar: built.sidebar,
      env,
      analysesRows: [],
      latestId: null,
      journalEntries,
      reviewSection,
      setReviewSection,
      selectedJournal,
      setSelectedJournal,
      comments,
      commentsError,
      commentsLoaded,
      unread,
    }),
  ];

  return (
    <div className="fullpage">
      <div className="detail-topbar">
        <a href="/">
          <ArrowLeft className="icon" size={13} /> 列表
        </a>
        <span className="title">{symLabel}</span>
        <span className="meta">{sym}</span>
        {degraded && <Dot tone="accent" pulse title="数据延迟：行情拉取失败，正在重试" />}
        <span className="topbar-chart-ctrls">
          <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />
        </span>
        <span className="topbar-actions">
          <TopbarQuote symbol={built.sidebar.symbol} />
        </span>
      </div>
      <div className="detail-body">
        <IntradayDashboard
          symbol={sym}
          built={built}
          activeTf={activeIntradayTf}
          sidebarTabs={sidebarTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}
