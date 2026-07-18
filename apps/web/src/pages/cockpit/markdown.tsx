import { ArrowRight, ChartCandlestick, LayoutDashboard, Library } from "lucide-react";
import type { ReactNode } from "react";
import { type Components, Streamdown } from "streamdown";
import { parseAppDeepLink } from "@kansoku/shared/appDeepLink";
import { navigate } from "@web/router";
import { openModal } from "@web/ui";
import { researchRoute } from "../research/researchModel";

type MarkdownVariant = "chat" | "report";

function MarkdownLink(props: Record<string, unknown>) {
  const href = typeof props.href === "string" ? props.href : undefined;
  const children = props.children as ReactNode;
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

export const MARKDOWN_COMPONENTS = {
  a: MarkdownLink,
  table: ({ children }: { children?: ReactNode }) => (
    <div className="typeset-scroll">
      <table>{children}</table>
    </div>
  ),
} as Components;

export function Markdown({
  children,
  variant = "report",
  streaming = false,
}: {
  children: string;
  variant?: MarkdownVariant;
  streaming?: boolean;
}) {
  return (
    <div className={`typeset typeset-${variant}`}>
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        controls={false}
        linkSafety={{ enabled: false }}
        components={MARKDOWN_COMPONENTS}
      >
        {children}
      </Streamdown>
    </div>
  );
}

export function openMarkdownModal({
  title,
  markdown,
  documentPath,
  onClose,
}: {
  title: string;
  markdown: string;
  documentPath?: string;
  onClose?: () => void;
}): () => void {
  return openModal({
    title,
    headerAction: documentPath
      ? (close) => (
          <button
            type="button"
            className="modal-head-action"
            aria-label="在研究库中打开"
            title="在研究库中打开"
            onClick={() => {
              close();
              navigate(researchRoute("journal", documentPath));
            }}
          >
            <Library size={16} />
          </button>
        )
      : undefined,
    body: <Markdown>{markdown}</Markdown>,
    onClose,
  });
}
