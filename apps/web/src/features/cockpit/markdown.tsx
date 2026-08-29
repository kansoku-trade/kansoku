import { ArrowRight, ChartCandlestick, LayoutDashboard, Library } from 'lucide-react';
import { cloneElement, createElement, isValidElement } from 'react';
import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react';
import { type Components, type ExtraProps, Streamdown } from 'streamdown';
import * as stylex from '@stylexjs/stylex';
import { parseAppDeepLink, type AppDeepLink } from '@kansoku/shared/appDeepLink';
import { navigate } from '@web/lib/router';
import { openModal } from '@web/ui';
import { researchRoute } from '../research/researchModel';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  typeset: {
    color: colors.textPrimary,
    fontFamily: fonts.ui,
    maxWidth: '100%',
    minWidth: 0,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  chat: {
    'fontSize': `calc(${fontSizes.base} * 1.125)`,
    'lineHeight': 1.6,
    '@media (min-width: 48rem), print': {
      fontSize: fontSizes.base,
    },
  },
  report: {
    'fontSize': `calc(${fontSizes.md} * 1.125)`,
    'lineHeight': 1.75,
    '@media (min-width: 48rem), print': {
      fontSize: fontSizes.md,
    },
  },
  link: {
    'color': colors.accent,
    'fontWeight': 500,
    'textDecorationColor': `color-mix(in srgb, ${colors.accent} 30%, transparent)`,
    'textDecorationLine': 'underline',
    ':hover': {
      textDecorationColor: colors.accent,
    },
    ':focus-visible': {
      borderRadius: radii.default,
      outline: `2px solid ${colors.focusBorder}`,
      outlineOffset: '2px',
    },
  },
  heading: {
    'breakAfter': 'auto',
    'color': colors.textPrimary,
    'fontFamily': fonts.ui,
    'fontWeight': 600,
    'marginBlockEnd': 0,
    '@media print': {
      breakAfter: 'avoid',
    },
    ':first-child': {
      marginBlockStart: 0,
    },
  },
  chatHeading1: { fontSize: '1.25em', lineHeight: 1.3, marginBlockStart: '0.8em' },
  chatHeading2: { fontSize: '1.15em', lineHeight: 1.4, marginBlockStart: '1.12em' },
  chatHeading3: { fontSize: '1.05em', lineHeight: 1.45, marginBlockStart: '0.8em' },
  chatHeading4: { fontSize: '1em', lineHeight: 1.5, marginBlockStart: '0.8em' },
  chatHeading5: {
    color: colors.textSecondary,
    fontSize: '0.875em',
    fontWeight: 500,
    lineHeight: 1.5,
    marginBlockStart: '0.914285em',
  },
  chatHeading6: {
    color: colors.textSecondary,
    fontSize: '0.8125em',
    fontWeight: 500,
    letterSpacing: '0.08em',
    lineHeight: 1.5,
    marginBlockStart: '0.984615em',
    textTransform: 'uppercase',
  },
  reportHeading1: { fontSize: '1.7em', lineHeight: 1.3, marginBlockStart: '1.15em' },
  reportHeading2: { fontSize: '1.35em', lineHeight: 1.4, marginBlockStart: '1.61em' },
  reportHeading3: { fontSize: '1.15em', lineHeight: 1.45, marginBlockStart: '1.15em' },
  reportHeading4: { fontSize: '1em', lineHeight: 1.5, marginBlockStart: '1.15em' },
  reportHeading5: {
    color: colors.textSecondary,
    fontSize: '0.875em',
    fontWeight: 500,
    lineHeight: 1.5,
    marginBlockStart: '1.314285em',
  },
  reportHeading6: {
    color: colors.textSecondary,
    fontSize: '0.8125em',
    fontWeight: 500,
    letterSpacing: '0.08em',
    lineHeight: 1.5,
    marginBlockStart: '1.415385em',
    textTransform: 'uppercase',
  },
  flowChat: {
    'marginBlockEnd': 0,
    'marginBlockStart': '0.8em',
    ':first-child': { marginBlockStart: 0 },
  },
  flowReport: {
    'marginBlockEnd': 0,
    'marginBlockStart': '1.15em',
    ':first-child': { marginBlockStart: 0 },
  },
  strong: {
    fontWeight: 600,
  },
  deleted: {
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  superscript: {
    fontSize: '0.75em',
    lineHeight: 0,
    position: 'relative',
    top: '-0.5em',
    verticalAlign: 'baseline',
  },
  subscript: {
    bottom: '-0.25em',
    fontSize: '0.75em',
    lineHeight: 0,
    position: 'relative',
    verticalAlign: 'baseline',
  },
  unorderedList: {
    listStyleType: {
      default: 'disc',
      [stylex.when.ancestor(':not(:empty)')]: 'circle',
    },
    paddingInlineStart: '1.5em',
  },
  orderedList: {
    listStyleType: 'decimal',
    paddingInlineStart: '1.5em',
  },
  taskList: {
    listStyleType: 'none',
    paddingInlineStart: '0.25em',
  },
  listItem: {
    'marginBlockStart': '0.5em',
    'paddingInlineStart': '0.4em',
    ':first-child': { marginBlockStart: 0 },
    '::marker': { color: colors.textSecondary },
  },
  taskCheckbox: {
    accentColor: colors.accent,
    marginInlineEnd: '0.5em',
    verticalAlign: '-0.1em',
  },
  summary: {
    'cursor': 'pointer',
    'fontWeight': 500,
    '::marker': { color: colors.textSecondary },
  },
  keyboard: {
    borderBlockEndWidth: '2px',
    borderColor: colors.border,
    borderRadius: '1.2px',
    borderStyle: 'solid',
    borderWidth: '1px',
    fontFamily: 'inherit',
    fontSize: '0.85em',
    fontWeight: 500,
    padding: '0.0625em 0.35em',
  },
  definitionTerm: {
    fontWeight: 500,
    marginBlockStart: '1em',
  },
  definitionDescription: {
    color: colors.textSecondary,
    marginBlockStart: '0.25em',
    marginInlineStart: 0,
    paddingInlineStart: '1em',
  },
  inlineCode: {
    'backgroundColor': colors.backgroundElement,
    'borderRadius': '1.2px',
    'fontFamily': fonts.mono,
    'fontSize': '0.85em',
    'padding': '0.125em 0.3em',
    '@media (forced-colors: active)': {
      borderColor: 'CanvasText',
      borderStyle: 'solid',
      borderWidth: '1px',
    },
  },
  codeBlock: {
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    ':is(pre)': {
      'backgroundColor': colors.backgroundElement,
      'borderRadius': radii.default,
      'direction': 'ltr',
      'fontFamily': fonts.mono,
      'fontSize': '0.875em',
      'lineHeight': 1.5,
      'marginBlockEnd': 0,
      'overflowX': 'auto',
      'padding': '0.75em 1em',
      'tabSize': 2,
      '@media print': {
        breakInside: 'avoid',
      },
    },
  },
  codeBlockChat: {
    ':is(pre)': {
      marginBlockStart: '0.914285em',
    },
  },
  codeBlockReport: {
    ':is(pre)': {
      marginBlockStart: '1.314285em',
    },
  },
  blockquote: {
    'borderInlineStartColor': colors.border,
    'borderInlineStartStyle': 'solid',
    'borderInlineStartWidth': '2px',
    'marginInline': 0,
    'paddingInlineStart': '1em',
    '@media print': {
      breakInside: 'avoid',
    },
  },
  rule: {
    'borderBlockEndWidth': 0,
    'borderBlockStartColor': colors.border,
    'borderBlockStartStyle': 'solid',
    'borderBlockStartWidth': '1px',
    'borderInlineWidth': 0,
    'marginBlockEnd': 0,
    ':first-child': { marginBlockStart: 0 },
  },
  ruleChat: {
    marginBlockStart: '1.92em',
  },
  ruleReport: {
    marginBlockStart: '2.76em',
  },
  footnotes: {
    borderBlockStartColor: colors.border,
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
    color: colors.textSecondary,
    fontSize: '0.875em',
    paddingBlockStart: '1em',
  },
  image: {
    borderRadius: radii.default,
    height: 'auto',
    maxWidth: '100%',
  },
  tableScroll: {
    maxWidth: '100%',
    overflowX: 'auto',
    width: '100%',
  },
  table: {
    'borderBlockEndColor': colors.border,
    'borderBlockEndStyle': 'solid',
    'borderBlockEndWidth': '1px',
    'borderCollapse': 'separate',
    'borderSpacing': 0,
    'fontSize': '1em',
    'fontVariantNumeric': 'tabular-nums',
    'lineHeight': 1.5,
    'marginBlockStart': 0,
    'maxWidth': 'none',
    'width': 'max-content',
    '@media print': {
      breakInside: 'avoid',
    },
  },
  tableHead: {
    'color': colors.textPrimary,
    'fontWeight': 500,
    'padding': '0.65em 1em',
    'textAlign': 'start',
    'whiteSpace': 'nowrap',
    ':first-child': {
      paddingInlineStart: 0,
    },
  },
  tableCell: {
    'borderBlockStartColor': colors.border,
    'borderBlockStartStyle': 'solid',
    'borderBlockStartWidth': '1px',
    'padding': '0.75em 1em',
    'textAlign': 'start',
    'verticalAlign': 'top',
    ':first-child': {
      paddingInlineStart: 0,
    },
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

export function MarkdownLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & ExtraProps) {
  const { href, children, className, node: _node, ...anchorProps } = props;
  const appLink = parseAppDeepLink(href);
  if (!appLink)
    return (
      <a
        {...anchorProps}
        className={[className, stylex.props(styles.link).className].filter(Boolean).join(' ')}
        href={href}
        rel={anchorProps.rel ?? 'noreferrer'}
        target={anchorProps.target ?? '_blank'}
      >
        {children}
      </a>
    );

  const meta = deepLinkCardMeta(appLink);
  return (
    <a
      {...anchorProps}
      className={[
        `app-deep-link app-deep-link--${meta.variant}`,
        className,
        stylex.props(styles.deepLink).className,
      ]
        .filter(Boolean)
        .join(' ')}
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

type SemanticProps = HTMLAttributes<HTMLElement> & ExtraProps;

function styledElement(tag: keyof HTMLElementTagNameMap, ...styleValues: stylex.StyleXStyles[]) {
  return ({ node: _node, className, ...props }: SemanticProps) =>
    createElement(tag, {
      ...props,
      className: [className, stylex.props(...styleValues).className].filter(Boolean).join(' '),
    });
}

function MarkdownInput({
  className,
  node: _node,
  type,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & ExtraProps) {
  return (
    <input
      {...props}
      className={[className, type === 'checkbox' && stylex.props(styles.taskCheckbox).className]
        .filter(Boolean)
        .join(' ')}
      type={type}
    />
  );
}

function MarkdownPre({ children, variant }: { children?: ReactNode; variant: MarkdownVariant }) {
  if (!isValidElement(children)) return children;

  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    'data-block': 'true',
    'className': [
      (children.props as { className?: string }).className,
      stylex.props(
        styles.codeBlock,
        variant === 'chat' ? styles.codeBlockChat : styles.codeBlockReport,
      ).className,
    ]
      .filter(Boolean)
      .join(' '),
  });
}

function markdownComponents(variant: MarkdownVariant): Components {
  const flowStyle = variant === 'chat' ? styles.flowChat : styles.flowReport;
  const headingStyles =
    variant === 'chat'
      ? [styles.chatHeading1, styles.chatHeading2, styles.chatHeading3, styles.chatHeading4]
      : [
          styles.reportHeading1,
          styles.reportHeading2,
          styles.reportHeading3,
          styles.reportHeading4,
        ];
  const headingStyle = (level: 1 | 2 | 3 | 4) =>
    stylex.props(styles.heading, headingStyles[level - 1]);
  const heading5 = variant === 'chat' ? styles.chatHeading5 : styles.reportHeading5;
  const heading6 = variant === 'chat' ? styles.chatHeading6 : styles.reportHeading6;

  return {
    a: MarkdownLink,
    p: styledElement('p', flowStyle),
    strong: styledElement('strong', styles.strong),
    b: styledElement('b', styles.strong),
    del: styledElement('del', styles.deleted),
    s: styledElement('s', styles.deleted),
    sup: styledElement('sup', styles.superscript),
    sub: styledElement('sub', styles.subscript),
    ul: ({ children, className, node: _node, ...props }: SemanticProps) => (
      <ul
        {...props}
        className={[
          className,
          stylex.props(
            styles.unorderedList,
            flowStyle,
            className?.includes('contains-task-list') && styles.taskList,
            stylex.defaultMarker(),
          ).className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </ul>
    ),
    ol: styledElement('ol', styles.orderedList, flowStyle),
    li: styledElement('li', styles.listItem),
    input: MarkdownInput,
    details: styledElement('details', flowStyle),
    summary: styledElement('summary', styles.summary),
    kbd: styledElement('kbd', styles.keyboard),
    dl: styledElement('dl', flowStyle),
    dt: styledElement('dt', styles.definitionTerm),
    dd: styledElement('dd', styles.definitionDescription),
    inlineCode: styledElement('code', styles.inlineCode),
    blockquote: styledElement('blockquote', styles.blockquote, flowStyle),
    hr: styledElement('hr', styles.rule, variant === 'chat' ? styles.ruleChat : styles.ruleReport),
    img: styledElement('img', styles.image, flowStyle),
    section: ({ children, className, node: _node, ...props }: SemanticProps) => (
      <section
        {...props}
        className={[
          className,
          stylex.props(
            flowStyle,
            (className?.includes('footnotes') || 'data-footnotes' in props) && styles.footnotes,
          ).className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </section>
    ),
    h1: ({
      children,
      className,
      node: _node,
      ...props
    }: HTMLAttributes<HTMLHeadingElement> & ExtraProps) => (
      <h1
        {...props}
        className={[className, headingStyle(1).className].filter(Boolean).join(' ')}
        data-streamdown="heading-1"
      >
        {children}
      </h1>
    ),
    h2: ({
      children,
      className,
      node: _node,
      ...props
    }: HTMLAttributes<HTMLHeadingElement> & ExtraProps) => (
      <h2
        {...props}
        className={[className, headingStyle(2).className].filter(Boolean).join(' ')}
        data-streamdown="heading-2"
      >
        {children}
      </h2>
    ),
    h3: ({
      children,
      className,
      node: _node,
      ...props
    }: HTMLAttributes<HTMLHeadingElement> & ExtraProps) => (
      <h3
        {...props}
        className={[className, headingStyle(3).className].filter(Boolean).join(' ')}
        data-streamdown="heading-3"
      >
        {children}
      </h3>
    ),
    h4: ({
      children,
      className,
      node: _node,
      ...props
    }: HTMLAttributes<HTMLHeadingElement> & ExtraProps) => (
      <h4
        {...props}
        className={[className, headingStyle(4).className].filter(Boolean).join(' ')}
        data-streamdown="heading-4"
      >
        {children}
      </h4>
    ),
    h5: styledElement('h5', styles.heading, heading5),
    h6: styledElement('h6', styles.heading, heading6),
    pre: ({ children }: { children?: ReactNode }) => (
      <MarkdownPre variant={variant}>{children}</MarkdownPre>
    ),
    table: ({ children }: { children?: ReactNode }) => (
      <div className={`typeset-scroll ${stylex.props(styles.tableScroll, flowStyle).className}`}>
        <table {...stylex.props(styles.table)}>{children}</table>
      </div>
    ),
    th: ({
      children,
      className,
      node: _node,
      ...props
    }: HTMLAttributes<HTMLTableCellElement> & ExtraProps) => (
      <th
        {...props}
        className={[
          'whitespace-nowrap px-4 py-2 text-left font-semibold text-sm',
          className,
          stylex.props(styles.tableHead).className,
        ]
          .filter(Boolean)
          .join(' ')}
        data-streamdown="table-header-cell"
      >
        {children}
      </th>
    ),
    td: ({
      children,
      className,
      node: _node,
      ...props
    }: HTMLAttributes<HTMLTableCellElement> & ExtraProps) => (
      <td
        {...props}
        className={[className, stylex.props(styles.tableCell).className].filter(Boolean).join(' ')}
      >
        {children}
      </td>
    ),
  } as Components;
}

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
        components={markdownComponents(variant)}
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
