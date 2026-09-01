import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from '../../../theme/tokens.stylex';
import { TurnCanvases } from '../../canvas/TurnCanvases';
import { Markdown } from '../markdown';
import { blockKey, type TranscriptBlock } from './presentTranscript.js';
import { ToolGroupRow, ToolRow } from './ToolCallViews.js';
import { WorkedFold } from './WorkedFold.js';

const chatThinkingPulse = stylex.keyframes({
  '0%, 100%': { opacity: 0.25 },
  '40%': { opacity: 1 },
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
  userBubble: {
    backgroundColor: colors.backgroundElement,
    color: colors.textPrimary,
    padding: '6px 10px',
    borderRadius: radii.userBubble,
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
    gap: '4px',
    padding: '8px 2px',
  },
  thinkingDot: {
    'width': '5px',
    'height': '5px',
    'borderRadius': radii.full,
    'backgroundColor': colors.textMuted,
    'animationName': chatThinkingPulse,
    'animationDuration': '1.2s',
    'animationTimingFunction': 'ease-in-out',
    'animationIterationCount': 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      opacity: 0.6,
    },
    ':nth-child(2)': {
      animationDelay: '0.2s',
    },
    ':nth-child(3)': {
      animationDelay: '0.4s',
    },
  },
  errorRow: {
    fontSize: fontSizes.base,
    color: colors.down,
    backgroundColor: colors.backgroundElement,
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    borderRadius: radii.lg,
    padding: '6px 10px',
  },
});

const tokenFormatter = new Intl.NumberFormat('en-US');
const costFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export function TranscriptBlockView({
  block,
  modelLabels,
  userBubbleClassName,
  insertClassName,
  onOpenCanvas,
}: {
  block: TranscriptBlock;
  modelLabels?: Readonly<Record<string, string>>;
  userBubbleClassName?: string;
  insertClassName?: string;
  onOpenCanvas?: (slug: string) => void;
}) {
  if (block.type === 'user') {
    return (
      <div className={`chat-row chat-row--user ${stylex.props(styles.row, styles.rowUser).className}`}>
        <div
          className={`chat-bubble chat-bubble--user ${stylex.props(styles.bubble, styles.userBubble).className}${userBubbleClassName ? ` ${userBubbleClassName}` : ''}`}
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
    return (
      <div className={`chat-row ${stylex.props(styles.row).className}`}>
        <div className={`chat-assistant-message ${stylex.props(styles.assistantMessage).className}`}>
          <div
            className={`chat-bubble chat-bubble--assistant ${stylex.props(styles.bubble, styles.assistantBubble).className}`}
          >
            <Markdown variant="chat" streaming={block.streaming}>
              {block.row.text ?? ''}
            </Markdown>
          </div>
          {meta && modelLabels ? (
            <div className={`chat-message-meta ${stylex.props(styles.messageMeta).className}`}>
              <span>{modelLabel}</span>
              <span className={stylex.props(styles.messageMetaSeparator).className}>
                {tokenFormatter.format(meta.totalTokens)} tokens
              </span>
              <span className={stylex.props(styles.messageMetaSeparator).className}>
                {costFormatter.format(meta.costTotal)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    );
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
            modelLabels={modelLabels}
            userBubbleClassName={userBubbleClassName}
            insertClassName={insertClassName}
            onOpenCanvas={onOpenCanvas}
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
          <span className={`chat-thinking-dot ${stylex.props(styles.thinkingDot).className}`} />
          <span className={`chat-thinking-dot ${stylex.props(styles.thinkingDot).className}`} />
          <span className={`chat-thinking-dot ${stylex.props(styles.thinkingDot).className}`} />
        </div>
      </div>
    );
  }
  return <div className={`chat-error-row ${stylex.props(styles.errorRow).className}`}>{block.row.text}</div>;
}
