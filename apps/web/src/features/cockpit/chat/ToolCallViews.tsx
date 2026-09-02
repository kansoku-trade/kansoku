import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from '../../../theme/tokens.stylex';
import { presentToolCall } from './toolSummary.js';
import type { PresentedTool } from './presentTranscript.js';

const chatToolStatusPulse = stylex.keyframes({
  '0%, 100%': { opacity: 0.35, transform: 'scale(0.72)' },
  '50%': { opacity: 1, transform: 'scale(1)' },
});

const runningBorder = 'rgb(94 78 38)';

const styles = stylex.create({
  tool: {
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: '3px 8px',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.lg,
  },
  toolRunning: {
    borderColor: runningBorder,
  },
  nested: {
    padding: 0,
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    borderRadius: 0,
  },
  toolHead: {
    'display': 'grid',
    'gridTemplateColumns': '14px minmax(0, 1fr) auto',
    'alignItems': 'center',
    'gap': '8px',
    'width': '100%',
    'minHeight': '26px',
    'padding': '3px 4px',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.default,
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
    width: '14px',
    height: '14px',
    color: colors.up,
  },
  toolStatusRunning: {
    color: colors.accent,
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
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    overflow: 'hidden',
  },
  toolTitle: {
    flexShrink: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  toolState: {
    flexShrink: 0,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    whiteSpace: 'nowrap',
  },
  toolContext: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minWidth: 0,
    overflow: 'hidden',
  },
  toolItem: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    height: '18px',
    padding: '0 6px',
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.full,
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
  },
  toolMeta: {
    minWidth: 0,
    overflow: 'hidden',
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  toolCaret: {
    'flex': 'none',
    'alignSelf': 'center',
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
    margin: '2px 0 4px 26px',
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
    borderRadius: radii.lg,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  fold: {
    overflow: 'hidden',
  },
  rail: {
    margin: '0 0 3px 11px',
    paddingLeft: '8px',
    borderLeftColor: colors.border,
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
  railRunning: {
    borderLeftColor: runningBorder,
  },
  groupMeta: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

const foldTransition = { duration: 0.2, ease: [0.2, 0.9, 0.3, 1] } as const;

function StatusMark({ running }: { running: boolean }) {
  return (
    <span
      className={`chat-tool-status${running ? ' running' : ''} ${stylex.props(styles.toolStatus, running && styles.toolStatusRunning).className}`}
      aria-hidden="true"
    >
      {running ? (
        <span className={`chat-tool-status-dot ${stylex.props(styles.toolStatusDot).className}`} />
      ) : (
        <Check size={11} strokeWidth={2.2} />
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
      className={`chat-tool${running ? ' chat-tool--running' : ''} ${stylex.props(styles.tool, running && !nested && styles.toolRunning, nested && styles.nested).className}`}
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
          <span className={`chat-tool-title ${stylex.props(styles.toolTitle).className}`}>
            {presentation.title}
          </span>
          {nested ? null : (
            <span
              className={`chat-tool-state ${stylex.props(styles.toolState).className}`}
              aria-live="polite"
            >
              {running ? '进行中' : '已完成'}
            </span>
          )}
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
      <AnimatePresence initial={false}>
        {open && hasDetail ? (
          <motion.div
            className={`chat-tool-detail ${stylex.props(styles.fold, styles.toolDetail).className}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={foldTransition}
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>
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
          <span className={`chat-tool-title ${stylex.props(styles.toolTitle).className}`}>{label}</span>
          <span className={`chat-tool-state ${stylex.props(styles.toolState).className}`}>{state}</span>
          {titles.length > 0 ? (
            <span className={`chat-tool-meta ${stylex.props(styles.groupMeta).className}`}>
              {titles.join(' · ')}
            </span>
          ) : null}
        </span>
        <ChevronRight
          size={12}
          className={`chat-tool-caret${open ? ' open' : ''} ${stylex.props(styles.toolCaret, open && styles.toolCaretOpen).className}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {shown.length > 0 ? (
          <motion.div
            id={id}
            className={stylex.props(styles.fold, styles.rail, running && styles.railRunning).className}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={foldTransition}
          >
            {shown.map((tool) => (
              <ToolRow key={tool.id} tool={tool} nested />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
