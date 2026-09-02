import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from '../../../theme/tokens.stylex';
import { TurnCanvases } from '../../canvas/TurnCanvases';
import { Markdown } from '../markdown';
import { collectSources } from './collectSources.js';
import { formatUsageLine } from './formatChatUsage.js';
import { MessageActions } from './MessageActions.js';
import { blockKey, type TranscriptBlock } from './presentTranscript.js';
import { ReasoningFold } from './ReasoningFold.js';
import { SourcesFold } from './SourcesFold.js';
import { TurnRuntime } from './TurnRuntime.js';
import { ToolGroupRow, ToolRow } from './ToolCallViews.js';
import { WorkedFold } from './WorkedFold.js';
import type { ChatChromeVariant } from './ChatComposer';

const chatBubbleRise = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(16px) scale(0.98)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

const chatThinkingBar = stylex.keyframes({
  '0%, 100%': { transform: 'scaleY(0.25)', opacity: 0.45 },
  '50%': { transform: 'scaleY(1)', opacity: 1 },
});

const chatThinkingCursor = stylex.keyframes({
  '0%, 49%': { opacity: 1 },
  '50%, 100%': { opacity: 0 },
});

const styles = stylex.create({
  row: {
    display: 'flex',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    minWidth: 0,
    maxWidth: '100%',
  },
  bubble: {
    maxWidth: '88%',
    fontSize: fontSizes.base,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
  userBubbleEnter: {
    'animationName': chatBubbleRise,
    'animationDuration': '0.26s',
    'animationTimingFunction': 'cubic-bezier(0.2, 0.9, 0.3, 1)',
    'animationFillMode': 'both',
    'transformOrigin': 'bottom right',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
  userBubble: {
    backgroundColor: colors.backgroundElement,
    color: colors.textPrimary,
    padding: '6px 10px',
  },
  assistantBubble: {
    maxWidth: '100%',
  },
  messageMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '5px',
    marginTop: '5px',
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: '9px',
    fontVariantNumeric: 'tabular-nums',
  },
  messageMetaSeparator: {
    '::before': {
      content: '"·"',
      marginRight: '5px',
      color: colors.borderStrong,
    },
  },
  insert: {
    margin: '10px 0',
  },
  thinking: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '8px 2px',
    fontFamily: fonts.mono,
    fontSize: '10px',
    letterSpacing: '0.08em',
    color: colors.textMuted,
  },
  thinkingBars: {
    display: 'inline-flex',
    alignItems: 'flex-end',
    gap: '2px',
    height: '10px',
  },
  thinkingBar: {
    'width': '2px',
    'height': '10px',
    'backgroundColor': colors.accent,
    'transformOrigin': 'bottom',
    'animationName': chatThinkingBar,
    'animationDuration': '0.9s',
    'animationTimingFunction': 'ease-in-out',
    'animationIterationCount': 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      transform: 'scaleY(0.6)',
    },
    ':nth-child(2)': {
      animationDelay: '0.15s',
    },
    ':nth-child(3)': {
      animationDelay: '0.3s',
    },
    ':nth-child(4)': {
      animationDelay: '0.45s',
    },
  },
  thinkingCursor: {
    'width': '5px',
    'height': '11px',
    'backgroundColor': colors.accent,
    'animationName': chatThinkingCursor,
    'animationDuration': '1s',
    'animationTimingFunction': 'step-end',
    'animationIterationCount': 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      opacity: 0.7,
    },
  },
  errorRow: {
    fontSize: fontSizes.base,
    color: colors.down,
    backgroundColor: colors.backgroundElement,
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
  },
});

const userBubbleChrome = stylex.create({
  assistant: {
    borderRadius: radii.userBubble,
  },
  panel: {
    borderRadius: radii.default,
  },
});

const errorRowChrome = stylex.create({
  assistant: {
    borderRadius: radii.lg,
    padding: '6px 10px',
  },
  panel: {
    borderRadius: radii.default,
    padding: '6px 8px',
  },
});

export function TranscriptBlockView({
  block,
  variant = 'assistant',
  modelLabels,
  userBubbleClassName,
  insertClassName,
  onOpenCanvas,
  onRetry,
  showActions = false,
}: {
  block: TranscriptBlock;
  variant?: ChatChromeVariant;
  modelLabels?: Readonly<Record<string, string>>;
  userBubbleClassName?: string;
  insertClassName?: string;
  onOpenCanvas?: (slug: string) => void;
  onRetry?: () => void;
  showActions?: boolean;
}) {
  if (block.type === 'user') {
    return (
      <div className={`chat-row chat-row--user ${stylex.props(styles.row, styles.rowUser).className}`}>
        <div
          className={`chat-bubble chat-bubble--user ${stylex.props(styles.bubble, styles.userBubble, block.row.optimistic && styles.userBubbleEnter, userBubbleChrome[variant]).className}${userBubbleClassName ? ` ${userBubbleClassName}` : ''}`}
        >
          {block.row.text}
        </div>
      </div>
    );
  }
  if (block.type === 'assistant') {
    const meta = block.row.meta;
    const modelLabel = meta
      ? (modelLabels?.[JSON.stringify([meta.provider, meta.model])] ?? `${meta.provider}/${meta.model}`)
      : null;
    const usageLine =
      meta && (meta.totalTokens > 0 || meta.costTotal > 0)
        ? formatUsageLine({
            totalTokens: meta.totalTokens,
            costTotal: meta.costTotal,
            calls: 1,
            input: meta.input,
            output: meta.output,
            cacheRead: meta.cacheRead,
            cacheWrite: meta.cacheWrite,
          })
        : null;
    const text = block.row.text ?? '';
    const sources = collectSources(text);
    return (
      <div className={`chat-row ${stylex.props(styles.row).className}`}>
        <div className={`chat-assistant-message ${stylex.props(styles.assistantMessage).className}`}>
          <div
            className={`chat-bubble chat-bubble--assistant ${stylex.props(styles.bubble, styles.assistantBubble).className}`}
          >
            <Markdown variant="chat" streaming={block.streaming}>
              {text}
            </Markdown>
          </div>
          <SourcesFold sources={sources} />
          {showActions && !block.streaming ? <MessageActions text={text} onRetry={onRetry} /> : null}
          {usageLine ? (
            <div className={`chat-context-bar ${stylex.props(styles.messageMeta).className}`}>
              {modelLabel ? (
                <>
                  <span>{modelLabel}</span>
                  <span className={stylex.props(styles.messageMetaSeparator).className}>{usageLine}</span>
                </>
              ) : (
                usageLine
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  if (block.type === 'runtime') {
    return <TurnRuntime startedAt={block.startedAt} />;
  }
  if (block.type === 'reasoning') {
    return <ReasoningFold text={block.text} streaming={block.streaming} />;
  }
  if (block.type === 'tool') return <ToolRow tool={block.tool} />;
  if (block.type === 'tool-group') {
    return (
      <ToolGroupRow id={block.id} tools={block.tools} running={block.running} titles={block.titles} />
    );
  }
  if (block.type === 'worked') {
    return (
      <WorkedFold durationMs={block.durationMs}>
        {block.blocks.map((child, index) => (
          <TranscriptBlockView
            key={blockKey(child, index)}
            block={child}
            variant={variant}
            modelLabels={modelLabels}
            userBubbleClassName={userBubbleClassName}
            insertClassName={insertClassName}
            onOpenCanvas={onOpenCanvas}
            onRetry={onRetry}
          />
        ))}
      </WorkedFold>
    );
  }
  if (block.type === 'canvases') {
    return <TurnCanvases entries={block.entries} onOpen={onOpenCanvas} />;
  }
  if (block.type === 'insert') {
    return (
      <div
        className={`chat-insert ${stylex.props(styles.insert).className}${insertClassName ? ` ${insertClassName}` : ''}`}
      >
        {block.insert.node}
      </div>
    );
  }
  if (block.type === 'thinking') {
    return (
      <div className={`chat-row ${stylex.props(styles.row).className}`}>
        <div
          className={`chat-bubble chat-bubble--assistant chat-thinking ${stylex.props(styles.bubble, styles.assistantBubble, styles.thinking).className}`}
          aria-label="正在思考"
        >
          <span className={`chat-thinking-bars ${stylex.props(styles.thinkingBars).className}`}>
            <span {...stylex.props(styles.thinkingBar)} />
            <span {...stylex.props(styles.thinkingBar)} />
            <span {...stylex.props(styles.thinkingBar)} />
            <span {...stylex.props(styles.thinkingBar)} />
          </span>
          <span>分析中</span>
          <span className={`chat-thinking-cursor ${stylex.props(styles.thinkingCursor).className}`} />
        </div>
      </div>
    );
  }
  return (
    <div
      className={`chat-error-row ${stylex.props(styles.errorRow, errorRowChrome[variant]).className}`}
    >
      {block.row.text}
    </div>
  );
}
