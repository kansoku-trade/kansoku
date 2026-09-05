import { useConversationFold } from './conversationFold.js';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from '../../../theme/tokens.stylex';
import { Fold } from '@web/ui';
import { presentToolCall } from './toolSummary.js';
import type { PresentedTool } from './presentTranscript.js';

const chatToolStatusPulse = stylex.keyframes({
  '0%, 100%': { opacity: 0.35, transform: 'scale(0.72)' },
  '50%': { opacity: 1, transform: 'scale(1)' },
});

const styles = stylex.create({
  tool: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: '1px 2px',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    borderRadius: radii.lg,
  },
  toolRunning: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 5%, ${colors.backgroundSurface})`,
  },
  toolHead: {
    'gap': '8px',
    'minHeight': '22px',
    'padding': '2px 4px',
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
    flexGrow: 1,
    flexShrink: 1,
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
});

function StatusMark({ running }: { running: boolean }) {
  return (
    <span
      className={clsx(
        'chat-tool-status',
        running && 'running',
        stylex.props(styles.toolStatus, running && styles.toolStatusRunning).className,
      )}
      aria-hidden="true"
    >
      {running ? (
        <span className={clsx('chat-tool-status-dot', stylex.props(styles.toolStatusDot).className)} />
      ) : (
        <Check size={11} strokeWidth={2.2} />
      )}
    </span>
  );
}

export function ToolRow({ tool }: { tool: PresentedTool }) {
  const [open, setOpen] = useConversationFold(`tool:${tool.id}`);
  const hasDetail = Boolean(tool.input || tool.output);
  const presentation = presentToolCall(tool.label, tool.input);
  const hasContext = presentation.items.length > 0 || Boolean(presentation.meta);
  const running = tool.running;

  return (
    <Fold
      open={open}
      onToggle={() => setOpen()}
      className={clsx(
        'chat-tool',
        running && 'chat-tool--running',
        stylex.props(styles.tool, running && styles.toolRunning).className,
      )}
    >
      <Fold.Trigger
        className={clsx('chat-tool-head', stylex.props(styles.toolHead).className)}
        disabled={!hasDetail}
        caret={hasDetail}
        aria-label={`${presentation.title}，${running ? '进行中' : '已完成'}`}
      >
        <StatusMark running={running} />
        <span className={clsx('chat-tool-content', stylex.props(styles.toolContent).className)}>
          <span className={clsx('chat-tool-title', stylex.props(styles.toolTitle).className)}>
            {presentation.title}
          </span>
          <span
            className={clsx('chat-tool-state', stylex.props(styles.toolState).className)}
            aria-live="polite"
          >
            {running ? '进行中' : '已完成'}
          </span>
          {hasContext ? (
            <span className={clsx('chat-tool-context', stylex.props(styles.toolContext).className)}>
              {presentation.items.map((item) => (
                <span
                  className={clsx('chat-tool-item', stylex.props(styles.toolItem).className)}
                  key={item}
                >
                  {item}
                </span>
              ))}
              {presentation.meta ? (
                <span className={clsx('chat-tool-meta', stylex.props(styles.toolMeta).className)}>
                  {presentation.meta}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </Fold.Trigger>
      {hasDetail ? (
        <Fold.Panel className={clsx('chat-tool-detail', stylex.props(styles.toolDetail).className)}>
          {tool.input ? (
            <div>
              <div
                className={clsx(
                  'chat-tool-detail-label',
                  stylex.props(styles.toolDetailLabel).className,
                )}
              >
                原始请求
              </div>
              <pre className={stylex.props(styles.toolDetailPre).className}>{tool.input}</pre>
            </div>
          ) : null}
          {tool.output ? (
            <div>
              <div
                className={clsx(
                  'chat-tool-detail-label',
                  stylex.props(styles.toolDetailLabel).className,
                )}
              >
                原始响应
              </div>
              <pre className={stylex.props(styles.toolDetailPre).className}>{tool.output}</pre>
            </div>
          ) : null}
        </Fold.Panel>
      ) : null}
    </Fold>
  );
}
