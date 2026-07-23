import { ArrowRight, ChartCandlestick, LayoutDashboard, Library } from 'lucide-react';
import type { ReactNode } from 'react';
import { type Components, Streamdown } from 'streamdown';
import { parseAppDeepLink, type AppDeepLink } from '@kansoku/shared/appDeepLink';
import { navigate } from '@web/lib/router';
import { openModal } from '@web/ui';
import { researchRoute } from '../research/researchModel';

type MarkdownVariant = 'chat' | 'report';

interface DeepLinkCardMeta {
  variant: 'chart' | 'analysis' | 'sepa' | 'cockpit';
  title: string;
  subject: string;
  detail: string;
  icon: ReactNode;
}

function deepLinkCardMeta(link: AppDeepLink): DeepLinkCardMeta {
  switch (link.kind) {
    case 'chart': {
      return {
        variant: 'chart',
        title: '打开历史图表',
        subject: link.chartId,
        detail: '自动定位到对应分析',
        icon: <ChartCandlestick size={16} />,
      };
    }
    case 'symbol-analysis': {
      return {
        variant: 'analysis',
        title: '打开这份分析',
        subject: link.symbol,
        detail: link.analysisId,
        icon: <ChartCandlestick size={16} />,
      };
    }
    case 'symbol-sepa': {
      return {
        variant: 'sepa',
        title: '打开 SEPA 仪表盘',
        subject: link.symbol,
        detail: link.analysisId ?? '最新 SEPA 状态',
        icon: <ChartCandlestick size={16} />,
      };
    }
    case 'symbol-cockpit': {
      return {
        variant: 'cockpit',
        title: '打开股票驾驶舱',
        subject: link.symbol,
        detail: '最新分析与实时行情',
        icon: <LayoutDashboard size={16} />,
      };
    }
  }
}

export function MarkdownLink(props: Record<string, unknown>) {
  const href = typeof props.href === 'string' ? props.href : undefined;
  const children = props.children as ReactNode;
  const appLink = parseAppDeepLink(href);
  if (!appLink) return <a href={href}>{children}</a>;

  const meta = deepLinkCardMeta(appLink);
  return (
    <a
      className={`app-deep-link app-deep-link--${meta.variant}`}
      href={appLink.route}
      aria-label={`${meta.title}：${meta.subject}，${meta.detail}`}
      title={href}
    >
      <span className="app-deep-link-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="app-deep-link-content">
        <span className="app-deep-link-title">{meta.title}</span>
        <span className="app-deep-link-meta">
          <span>{meta.subject}</span>
          <span>{meta.detail}</span>
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
  variant = 'report',
  streaming = false,
}: {
  children: string;
  variant?: MarkdownVariant;
  streaming?: boolean;
}) {
  return (
    <div className={`typeset typeset-${variant}`}>
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
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
              navigate(researchRoute('journal', documentPath));
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
