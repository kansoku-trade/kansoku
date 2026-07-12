import type { CockpitComment, IntradaySidebar, SymbolAnalysisRow } from "../../../../shared/types";
import type { SidebarTab } from "../../charts/SidebarTabs";
import { NewsTab } from "../../charts/intraday/tabs/NewsTab";
import { Badge } from "../../ui";
import { AiTab } from "./AiTab";
import type { CockpitEnvState } from "./useCockpitEnv";
import { EnvTab } from "./EnvTab";
import { FlowTab } from "./FlowTab";
import { ReviewTab, type ReviewSection } from "./ReviewTab";

export function buildSharedSidebarTabs(params: {
  sym: string;
  sidebar: IntradaySidebar;
  env: CockpitEnvState;
  analysesRows: SymbolAnalysisRow[];
  latestId: string | null;
  journalEntries: { name: string; date: string }[];
  reviewSection: ReviewSection;
  setReviewSection: (section: ReviewSection) => void;
  selectedJournal: string | null;
  setSelectedJournal: (name: string | null) => void;
  comments: CockpitComment[];
  commentsError: string | null;
  commentsLoaded: boolean;
  unread: number;
}): SidebarTab[] {
  const { sym, sidebar, env, analysesRows, latestId, journalEntries, reviewSection, setReviewSection, selectedJournal, setSelectedJournal, comments, commentsError, commentsLoaded, unread } = params;
  const hasNews = Boolean(sidebar.context?.news?.length) || Boolean(sidebar.news?.length);

  return [
    {
      key: "env",
      label: "环境",
      content: (
        <>
          <EnvTab
            position={env.position}
            positionError={env.positionError}
            benchmark={env.benchmark}
            benchmarkError={env.benchmarkError}
            relvol={env.relvol}
          />
          <FlowTab symbol={sym} />
        </>
      ),
    },
    { key: "news", label: "消息", hidden: !hasNews, content: <NewsTab context={sidebar.context} news={sidebar.news ?? []} /> },
    {
      key: "review",
      label: "复盘",
      content: (
        <ReviewTab
          symbol={sym}
          rows={analysesRows}
          currentId={latestId}
          journal={journalEntries}
          section={reviewSection}
          onSectionChange={setReviewSection}
          selectedJournal={selectedJournal}
          onSelectJournal={setSelectedJournal}
        />
      ),
    },
    {
      key: "ai",
      label: (
        <>
          AI 点评{unread > 0 && <Badge tone="down" className="unread-badge">{unread}</Badge>}
        </>
      ),
      content: <AiTab symbol={sym} comments={comments} error={commentsError} loaded={commentsLoaded} />,
    },
  ];
}
