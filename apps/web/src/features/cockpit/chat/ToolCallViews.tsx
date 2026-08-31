import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from '../../../theme/tokens.stylex';
import { presentToolCall } from './toolSummary.js';
import type { PresentedTool } from './presentTranscript.js';

const chatToolStatusPulse = stylex.keyframes({
  '0%, 100%': { opacity: 0.35, transform: 'scale(0.72)' },
  '50%': { opacity: 1, transform: 'scale(1)' },
});

const styles = stylex.create({
  tool: {
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: '2px 0 8px',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  toolRunning: {
    borderBottomColor: 'rgb(94 78 38)',
  },
  toolHead: {
    'display': 'grid',
    'gridTemplateColumns': '18px minmax(0, 1fr) auto',
    'alignItems': 'start',
    'gap': '9px',
    'width': '100%',
    'padding': '6px 4px',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.md,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'textAlign': 'left',
    ':disabled': {
      cursor: 'default',
    },
    ':not(:disabled):hover': {
      backgroundColor: 'rgb(32 32 32 / 0.58)',
    },
  },
  toolStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    marginTop: '1px',
    color: colors.up,
    backgroundColor: 'rgb(38 166 154 / 0.16)',
    borderRadius: radii.full,
  },
  toolStatusRunning: {
    color: colors.accent,
    backgroundColor: 'rgb(255 176 0 / 0.14)',
  },
  toolStatusDot: {
    'width': '6px',
    'height': '6px',
    'backgroundColor': 'currentColor',
    'borderRadius': radii.full,
    'animationName': chatToolStatusPulse,
    'animationDuration': '1.2s',
    'animationTimingFunction': 'ease-in-out',
    'animationIterationCount': 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
  toolContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  toolTitleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: '5px 10px',
  },
  toolTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  toolState: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  toolContext: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '5px',
    minWidth: 0,
  },
  toolItem: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '20px',
    padding: '2px 7px',
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.md,
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  toolMeta: {
    minWidth: 0,
    overflow: 'hidden',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  toolCaret: {
    'flex': 'none',
    'alignSelf': 'center',
    'marginTop': '2px',
    'color': colors.textMuted,
    'transition': 'transform 0.12s ease',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  toolCaretOpen: {
    transform: 'rotate(90deg)',
  },
  toolDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: '4px 0 0 31px',
    padding: '4px 0 2px 12px',
    borderLeftColor: colors.border,
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
  toolDetailLabel: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginBottom: '2px',
  },
  toolDetailPre: {
    margin: 0,
    padding: '7px 9px',
    maxHeight: '200px',
    overflow: 'auto',
    backgroundColor: colors.backgroundElement,
    borderStyle: 'none',
    borderWidth: 0,
    borderRadius: radii.md,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  nested: {
    marginLeft: '27px',
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  groupLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    minWidth: 0,
  },
});

function StatusMark({ running }: { running: boolean }) {
  return (
    <span
      className={`chat-tool-status${running ? ' running' : ''} ${stylex.props(styles.toolStatus, running && styles.toolStatusRunning).className}`}
      aria-hidden="true"
    >
      {running ? (
        <span className={`chat-tool-status-dot ${stylex.props(styles.toolStatusDot).className}`} />
      ) : (
        <Check size={10} strokeWidth={2} />
      )}
    </span>
  );
}

export function ToolRow({
  tool,
  nested = false,
}: {
  tool: PresentedTool;
  nested?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(tool.input || tool.output);
  const presentation = presentToolCall(tool.label, tool.input);
  const hasContext = presentation.items.length > 0 || Boolean(presentation.meta);
  const running = tool.running;

  return (
    <div
      className={`chat-tool${running ? ' chat-tool--running' : ''} ${stylex.props(styles.tool, running && styles.toolRunning, nested && styles.nested).className}`}
    >
      <button
        type="button"
        className={`chat-tool-head ${stylex.props(styles.toolHead).className}`}
        onClick={() => setOpen((current) => !current)}
        disabled={!hasDetail}
        aria-expanded={open}
        aria-label={`${presentation.title}，${running ? '进行中' : '已完成'}`}
      >
        <StatusMark running={running} />
        <span className={`chat-tool-content ${stylex.props(styles.toolContent).className}`}>
          <span className={`chat-tool-title-row ${stylex.props(styles.toolTitleRow).className}`}>
            <span className={`chat-tool-title ${stylex.props(styles.toolTitle).className}`}>
              {presentation.title}
            </span>
            <span
              className={`chat-tool-state ${stylex.props(styles.toolState).className}`}
              aria-live="polite"
            >
              {running ? '进行中' : '已完成'}
            </span>
          </span>
          {hasContext ? (
            <span className={`chat-tool-context ${stylex.props(styles.toolContext).className}`}>
              {presentation.items.map((item) => (
                <span className={`chat-tool-item ${stylex.props(styles.toolItem).className}`} key={item}>
                  {item}
                </span>
              ))}
              {presentation.meta ? (
                <span className={`chat-tool-meta ${stylex.props(styles.toolMeta).className}`}>
                  {presentation.meta}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        {hasDetail ? (
          <ChevronRight
            size={12}
            className={`chat-tool-caret${open ? ' open' : ''} ${stylex.props(styles.toolCaret, open && styles.toolCaretOpen).className}`}
          />
        ) : null}
      </button>
      {open && hasDetail ? (
        <div className={`chat-tool-detail ${stylex.props(styles.toolDetail).className}`}>
          {tool.input ? (
            <div>
              <div className={`chat-tool-detail-label ${stylex.props(styles.toolDetailLabel).className}`}>
                原始请求
              </div>
              <pre className={stylex.props(styles.toolDetailPre).className}>{tool.input}</pre>
            </div>
          ) : null}
          {tool.output ? (
            <div>
              <div className={`chat-tool-detail-label ${stylex.props(styles.toolDetailLabel).className}`}>
                原始响应
              </div>
              <pre className={stylex.props(styles.toolDetailPre).className}>{tool.output}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ToolGroupRow({
  id,
  tools,
  running,
  titles,
}: {
  id: string;
  tools: PresentedTool[];
  running: boolean;
  titles: string[];
}) {
  const [open, setOpen] = useState(false);
  const current = tools.filter((tool) => tool.running);
  const shown = open ? tools : current;
  const label = `${tools.length} 个工具`;
  const state = running ? '进行中' : '已完成';

  return (
    <div
      className={`chat-tool-group${running ? ' chat-tool-group--running' : ''} ${stylex.props(styles.tool, running && styles.toolRunning).className}`}
    >
      <button
        type="button"
        className={`chat-tool-head ${stylex.props(styles.toolHead).className}`}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}，${state}`}
      >
        <StatusMark running={running} />
        <span className={`chat-tool-content ${stylex.props(styles.toolContent).className}`}>
          <span className={stylex.props(styles.groupLine).className}>
            <span className={`chat-tool-title ${stylex.props(styles.toolTitle).className}`}>{label}</span>
            <span className={`chat-tool-state ${stylex.props(styles.toolState).className}`}>{state}</span>
            {titles.length > 0 ? (
              <span className={`chat-tool-meta ${stylex.props(styles.toolMeta).className}`}>
                {titles.join(' · ')}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronRight
          size={12}
          className={`chat-tool-caret${open ? ' open' : ''} ${stylex.props(styles.toolCaret, open && styles.toolCaretOpen).className}`}
        />
      </button>
      {shown.length > 0 ? (
        <div id={id}>
          {shown.map((tool) => (
            <ToolRow key={tool.id} tool={tool} nested />
          ))}
        </div>
      ) : null}
    </div>
  );
}
