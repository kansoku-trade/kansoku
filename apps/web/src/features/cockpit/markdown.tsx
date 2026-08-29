import { ArrowRight, ChartCandlestick, LayoutDashboard, Library } from 'lucide-react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { type Components, Streamdown } from 'streamdown';
import * as stylex from '@stylexjs/stylex';
import { parseAppDeepLink, type AppDeepLink } from '@kansoku/shared/appDeepLink';
import { navigate } from '@web/lib/router';
import { openModal } from '@web/ui';
import { researchRoute } from '../research/researchModel';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  typeset: {
    'color': colors.textPrimary,
    'overflowWrap': 'anywhere',
    'wordBreak': 'break-word',
    '--color-foreground': colors.textPrimary,
    '--color-muted-foreground': colors.textSecondary,
    '--color-muted': colors.backgroundElement,
    '--color-border': colors.border,
    '--color-ring': colors.focusBorder,
    '--typeset-font-body': fonts.ui,
    '--typeset-font-heading': fonts.ui,
    '--typeset-font-mono': fonts.mono,
    ':is(a)': {
      color: colors.accent,
    },
    ':is(a):hover': {
      textDecorationColor: colors.accent,
    },
    ':is(pre)': {
      borderColor: colors.border,
      borderStyle: 'solid',
      borderWidth: '1px',
    },
    ':is(thead th)': {
      color: colors.textPrimary,
      fontWeight: 600,
    },
  },
  chat: {
    'fontSize': fontSizes.base,
    'lineHeight': 1.6,
    '--typeset-size': fontSizes.base,
    '--typeset-leading': '1.6',
    '--typeset-flow': '0.8em',
    '--typeset-h1': '1.25em',
    '--typeset-h2': '1.15em',
    '--typeset-h3': '1.05em',
    '--typeset-h4': '1em',
    ':is(h1)': { fontSize: '1.25em' },
    ':is(h2)': { fontSize: '1.15em' },
    ':is(h3)': { fontSize: '1.05em' },
    ':is(h4)': { fontSize: '1em' },
  },
  report: {
    'fontSize': fontSizes.md,
    'lineHeight': 1.75,
    '--typeset-size': fontSizes.md,
    '--typeset-leading': '1.75',
    '--typeset-flow': '1.15em',
    '--typeset-h1': '1.7em',
    '--typeset-h2': '1.35em',
    '--typeset-h3': '1.15em',
    '--typeset-h4': '1em',
    ':is(h1)': { fontSize: '1.7em' },
    ':is(h2)': { fontSize: '1.35em' },
    ':is(h3)': { fontSize: '1.15em' },
    ':is(h4)': { fontSize: '1em' },
  },
  deepLink: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textPrimary,
    'display': 'inline-flex',
    'gap': '5px',
    'marginBottom': '1px',
    'marginLeft': '4px',
    'marginTop': '1px',
    'maxWidth': 'min(440px, 100%)',
    'padding': '2px 5px 2px 3px',
    'textDecoration': 'none',
    'transition': 'border-color 120ms ease, background-color 120ms ease, transform 120ms ease',
    'verticalAlign': 'middle',
    'width': 'auto',
    ':hover': {
      backgroundColor: colors.backgroundElement,
      borderColor: `color-mix(in srgb, ${colors.accent} 55%, transparent)`,
      color: colors.textPrimary,
      textDecoration: 'none',
      transform: 'translateX(1px)',
    },
    ':focus-visible': {
      backgroundColor: colors.backgroundElement,
      borderColor: `color-mix(in srgb, ${colors.accent} 55%, transparent)`,
      color: colors.textPrimary,
      outline: 'none',
      textDecoration: 'none',
      transform: 'translateX(1px)',
    },
    ':hover .app-deep-link-arrow': {
      color: colors.accent,
      transform: 'translateX(2px)',
    },
    ':focus-visible .app-deep-link-arrow': {
      color: colors.accent,
      transform: 'translateX(2px)',
    },
  },
  deepLinkIcon: {
    alignItems: 'center',
    backgroundColor: `color-mix(in srgb, ${colors.accent} 7%, transparent)`,
    borderColor: `color-mix(in srgb, ${colors.accent} 18%, transparent)`,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.accent,
    display: 'inline-flex',
    flexGrow: 0,
    flexShrink: 0,
    height: '20px',
    justifyContent: 'center',
    width: '20px',
  },
  deepLinkContent: {
    alignItems: 'baseline',
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    gap: '6px',
    lineHeight: 1.25,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  deepLinkTitle: {
    color: colors.textPrimary,
    flexGrow: 0,
    flexShrink: 0,
    fontSize: fontSizes.sm,
    fontWeight: 600,
  },
  deepLinkMeta: {
    'alignItems': 'baseline',
    'color': colors.textMuted,
    'display': 'flex',
    'fontSize': fontSizes.xs,
    'gap': '5px',
    'minWidth': 0,
    'overflow': 'hidden',
    '::before': {
      color: colors.textMuted,
      content: '"·"',
    },
  },
  deepLinkMetaSubject: {
    color: colors.textSecondary,
    flexGrow: 0,
    flexShrink: 0,
    fontFamily: fonts.mono,
  },
  deepLinkMetaDetail: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deepLinkArrow: {
    color: colors.textMuted,
    flexGrow: 0,
    flexShrink: 0,
    transition: 'color 120ms ease, transform 120ms ease',
  },
  modalAction: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderRadius': radii.default,
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'height': '24px',
    'justifyContent': 'center',
    'padding': 0,
    'width': '24px',
    ':hover': { backgroundColor: colors.backgroundHover, color: colors.textPrimary },
    ':focus-visible': { outline: colors.focusOutline, outlineOffset: '1px' },
  },
});

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

export function MarkdownLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { href, children } = props;
  const appLink = parseAppDeepLink(href);
  if (!appLink) return <a href={href}>{children}</a>;

  const meta = deepLinkCardMeta(appLink);
  return (
    <a
      className={`app-deep-link app-deep-link--${meta.variant} ${stylex.props(styles.deepLink).className}`}
      href={appLink.route}
      aria-label={`${meta.title}：${meta.subject}，${meta.detail}`}
      title={href}
    >
      <span
        className={`app-deep-link-icon ${stylex.props(styles.deepLinkIcon).className}`}
        aria-hidden="true"
      >
        {meta.icon}
      </span>
      <span className={`app-deep-link-content ${stylex.props(styles.deepLinkContent).className}`}>
        <span className={`app-deep-link-title ${stylex.props(styles.deepLinkTitle).className}`}>
          {meta.title}
        </span>
        <span className={`app-deep-link-meta ${stylex.props(styles.deepLinkMeta).className}`}>
          <span className={stylex.props(styles.deepLinkMetaSubject).className}>{meta.subject}</span>
          <span className={stylex.props(styles.deepLinkMetaDetail).className}>{meta.detail}</span>
        </span>
      </span>
      <ArrowRight
        className={`app-deep-link-arrow ${stylex.props(styles.deepLinkArrow).className}`}
        size={15}
        aria-hidden="true"
      />
    </a>
  );
}

const MARKDOWN_COMPONENTS = {
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
    <div
      className={`typeset typeset-${variant} ${stylex.props(styles.typeset, variant === 'chat' ? styles.chat : styles.report).className}`}
    >
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
            className={`modal-head-action ${stylex.props(styles.modalAction).className}`}
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
