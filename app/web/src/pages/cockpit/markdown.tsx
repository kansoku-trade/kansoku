import { ArrowRight, ChartCandlestick, LayoutDashboard } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseAppDeepLink } from "../../../../shared/appDeepLink";
import { openModal } from "../../ui";

type MarkdownVariant = "chat" | "report";

function MarkdownLink({ href, children }: ComponentPropsWithoutRef<"a">) {
  const appLink = parseAppDeepLink(href);
  if (!appLink) return <a href={href}>{children}</a>;

  const legacyChart = appLink.kind === "chart";
  const analysis = appLink.kind === "symbol-analysis";
  const title = legacyChart ? "打开历史图表" : analysis ? "打开这份分析" : "打开股票驾驶舱";
  const subject = legacyChart ? appLink.chartId : appLink.symbol;
  const detail = legacyChart ? "自动定位到对应分析" : appLink.analysisId ?? "最新分析与实时行情";
  return (
    <a
      className={`app-deep-link app-deep-link--${legacyChart ? "chart" : analysis ? "analysis" : "cockpit"}`}
      href={appLink.route}
      aria-label={`${title}：${subject}，${detail}`}
      title={href}
    >
      <span className="app-deep-link-icon" aria-hidden="true">
        {legacyChart || analysis ? <ChartCandlestick size={16} /> : <LayoutDashboard size={16} />}
      </span>
      <span className="app-deep-link-content">
        <span className="app-deep-link-title">{title}</span>
        <span className="app-deep-link-meta">
          <span>{subject}</span>
          <span>{detail}</span>
        </span>
      </span>
      <ArrowRight className="app-deep-link-arrow" size={15} aria-hidden="true" />
    </a>
  );
}

export const MARKDOWN_COMPONENTS: Components = {
  a: MarkdownLink,
  table: ({ children }) => (
    <div className="typeset-scroll">
      <table>{children}</table>
    </div>
  ),
};

export function Markdown({
  children,
  variant = "report",
}: {
  children: string;
  variant?: MarkdownVariant;
}) {
  return (
    <div className={`typeset typeset-${variant}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function openMarkdownModal({
  title,
  markdown,
  onClose,
}: {
  title: string;
  markdown: string;
  onClose?: () => void;
}): () => void {
  return openModal({
    title,
    body: <Markdown>{markdown}</Markdown>,
    onClose,
  });
}
