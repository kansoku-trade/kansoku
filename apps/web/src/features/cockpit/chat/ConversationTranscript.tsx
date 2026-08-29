import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Check, ChevronRight } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { ScrollArea } from '@web/ui';
import { colors, fonts, fontSizes, radii, sizes } from '../../../theme/tokens.stylex';
import { CanvasCard } from '../../canvas/CanvasCard';
import { canvasEntryFromTool, isLastSaveForSlug } from '../../canvas/canvasEntries';
import { Markdown } from '../markdown';
import { mergeTimeline, type TranscriptInsert } from './transcriptTimeline.js';
import { presentToolCall, toolRowKey } from './toolSummary.js';
import type { ChatLiveTool, ChatRow } from './useChatSession';

const chatThinkingPulse = stylex.keyframes({
  '0%, 100%': { opacity: 0.25 },
  '40%': { opacity: 1 },
});

const chatToolStatusPulse = stylex.keyframes({
  '0%, 100%': { opacity: 0.35, transform: 'scale(0.72)' },
  '50%': { opacity: 1, transform: 'scale(1)' },
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
    fontSize: '12px',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
  userBubble: {
    backgroundColor: colors.backgroundElement,
    color: colors.textPrimary,
    padding: '6px 10px',
    borderRadius: radii.default,
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
  transcriptViewport: {
    overflowAnchor: 'none',
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
  scrollBottom: {
    'position': 'sticky',
    'bottom': '6px',
    'alignSelf': 'flex-end',
    'marginLeft': 'auto',
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': sizes.controlHeight,
    'height': sizes.controlHeight,
    'padding': 0,
    'backgroundColor': colors.backgroundElement,
    'color': colors.textSecondary,
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'borderRadius': radii.md,
    'cursor': 'pointer',
    ':hover': {
      borderColor: colors.borderStrong,
      color: colors.textPrimary,
    },
  },
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
  errorRow: {
    fontSize: fontSizes.base,
    color: colors.down,
    backgroundColor: colors.backgroundElement,
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    padding: '6px 8px',
  },
  empty: {
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  emptyText: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  suggestions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    alignItems: 'center',
  },
  suggestion: {
    'fontSize': fontSizes.sm,
    'color': colors.textSecondary,
    'backgroundColor': 'transparent',
    'borderColor': colors.borderStrong,
    'borderStyle': 'dashed',
    'borderWidth': '1px',
    'borderRadius': radii.default,
    'padding': '4px 9px',
    'cursor': 'pointer',
    ':hover': {
      color: colors.textPrimary,
      borderColor: colors.accent,
      borderStyle: 'solid',
    },
  },
});

const SCROLL_STICK_THRESHOLD = 48;
const tokenFormatter = new Intl.NumberFormat('en-US');
const costFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function ToolRow({
  label,
  running,
  input,
  output,
}: {
  label: string;
  running: boolean;
  input?: string;
  output?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(input || output);
  const presentation = presentToolCall(label, input);
  const hasContext = presentation.items.length > 0 || Boolean(presentation.meta);

  return (
    <div
      className={`chat-tool${running ? ' chat-tool--running' : ''} ${stylex.props(styles.tool, running && styles.toolRunning).className}`}
    >
      <button
        type="button"
        className={`chat-tool-head ${stylex.props(styles.toolHead).className}`}
        onClick={() => setOpen((current) => !current)}
        disabled={!hasDetail}
        aria-expanded={open}
        aria-label={`${presentation.title}，${running ? '进行中' : '已完成'}`}
      >
        <span
          className={`chat-tool-status${running ? ' running' : ''} ${stylex.props(styles.toolStatus, running && styles.toolStatusRunning).className}`}
          aria-hidden="true"
        >
          {running ? (
            <span
              className={`chat-tool-status-dot ${stylex.props(styles.toolStatusDot).className}`}
            />
          ) : (
            <Check size={10} strokeWidth={2} />
          )}
        </span>
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
              {presentation.items.map((item, index) => (
                <span
                  className={`chat-tool-item ${stylex.props(styles.toolItem).className}`}
                  key={`${item}-${index}`}
                >
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
          {input ? (
            <div>
              <div
                className={`chat-tool-detail-label ${stylex.props(styles.toolDetailLabel).className}`}
              >
                原始请求
              </div>
              <pre className={stylex.props(styles.toolDetailPre).className}>{input}</pre>
            </div>
          ) : null}
          {output ? (
            <div>
              <div
                className={`chat-tool-detail-label ${stylex.props(styles.toolDetailLabel).className}`}
              >
                原始响应
              </div>
              <pre className={stylex.props(styles.toolDetailPre).className}>{output}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChatRowView({
  row,
  rowIndex,
  rows,
  modelLabels,
  onOpenCanvas,
  onViewCanvasSource,
}: {
  row: ChatRow;
  rowIndex: number;
  rows: ChatRow[];
  modelLabels?: Readonly<Record<string, string>>;
  onOpenCanvas?: (slug: string) => void;
  onViewCanvasSource?: (slug: string) => void;
}) {
  if (row.kind === 'user') {
    return (
      <div
        className={`chat-row chat-row--user ${stylex.props(styles.row, styles.rowUser).className}`}
      >
        <div
          className={`chat-bubble chat-bubble--user ${stylex.props(styles.bubble, styles.userBubble).className}`}
        >
          {row.text}
        </div>
      </div>
    );
  }
  if (row.kind === 'assistant') {
    const meta = row.meta;
    const modelLabel = meta
      ? (modelLabels?.[JSON.stringify([meta.provider, meta.model])] ??
        `${meta.provider}/${meta.model}`)
      : null;
    return (
      <div className={`chat-row ${stylex.props(styles.row).className}`}>
        <div
          className={`chat-assistant-message ${stylex.props(styles.assistantMessage).className}`}
        >
          <div
            className={`chat-bubble chat-bubble--assistant ${stylex.props(styles.bubble, styles.assistantBubble).className}`}
          >
            <Markdown variant="chat">{row.text ?? ''}</Markdown>
          </div>
          {meta && modelLabels ? (
            <div className={`chat-message-meta ${stylex.props(styles.messageMeta).className}`}>
              <span>{modelLabel}</span>
              <span>{tokenFormatter.format(meta.totalTokens)} tokens</span>
              <span>{costFormatter.format(meta.costTotal)}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  if (row.kind === 'tool') {
    const entry = canvasEntryFromTool(row.label ?? '', row.input, row.output);
    const showCard =
      entry && onOpenCanvas && onViewCanvasSource && isLastSaveForSlug(rows, rowIndex, entry.slug);
    return (
      <>
        <ToolRow label={row.label ?? ''} running={false} input={row.input} output={row.output} />
        {showCard && entry ? (
          <CanvasCard
            slug={entry.slug}
            title={entry.title}
            onOpen={() => onOpenCanvas(entry.slug)}
            onSource={() => onViewCanvasSource(entry.slug)}
          />
        ) : null}
      </>
    );
  }
  return (
    <div className={`chat-error-row ${stylex.props(styles.errorRow).className}`}>{row.text}</div>
  );
}

function ConversationTranscriptView({
  rows,
  inserts = [],
  busy,
  streamText,
  liveTools,
  suggestions,
  emptyText,
  onPickSuggestion,
  className,
  modelLabels,
  onOpenCanvas,
  onViewCanvasSource,
}: {
  rows: ChatRow[];
  inserts?: TranscriptInsert[];
  busy: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  suggestions: string[];
  emptyText: string;
  onPickSuggestion: (question: string) => void;
  className?: string;
  modelLabels?: Readonly<Record<string, string>>;
  onOpenCanvas?: (slug: string) => void;
  onViewCanvasSource?: (slug: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [stuck, setStuck] = useState(true);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element || !stickRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [rows, inserts, streamText, liveTools]);

  const timeline = useMemo(() => mergeTimeline(rows, inserts), [rows, inserts]);

  const isEmpty =
    rows.length === 0 && inserts.length === 0 && liveTools.length === 0 && !streamText;

  return (
    <ScrollArea
      className={className}
      viewportClassName={`chat-transcript-viewport ${stylex.props(styles.transcriptViewport).className}`}
      contentClassName="chat-panel-body-content"
      viewportRef={bodyRef}
      onScroll={() => {
        const element = bodyRef.current;
        if (!element) return;
        const next =
          element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_STICK_THRESHOLD;
        stickRef.current = next;
        setStuck(next);
      }}
    >
      {isEmpty && !busy ? (
        <div className={`chat-empty ${stylex.props(styles.empty).className}`}>
          <div className={`chat-empty-text ${stylex.props(styles.emptyText).className}`}>
            {emptyText}
          </div>
          {suggestions.length > 0 ? (
            <div className={`chat-suggestions ${stylex.props(styles.suggestions).className}`}>
              {suggestions.map((question) => (
                <button
                  type="button"
                  key={question}
                  className={`chat-suggestion ${stylex.props(styles.suggestion).className}`}
                  onClick={() => onPickSuggestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {timeline.map((entry) =>
        entry.kind === 'row' ? (
          <ChatRowView
            key={entry.row.id}
            row={entry.row}
            rowIndex={rows.indexOf(entry.row)}
            rows={rows}
            modelLabels={modelLabels}
            onOpenCanvas={onOpenCanvas}
            onViewCanvasSource={onViewCanvasSource}
          />
        ) : (
          <div key={entry.insert.id} className="chat-insert">
            {entry.insert.node}
          </div>
        ),
      )}
      {liveTools.map((tool) => (
        <ToolRow
          key={toolRowKey('live', tool.id)}
          label={tool.label}
          running={tool.status === 'start'}
          input={tool.input}
          output={tool.output}
        />
      ))}
      {streamText ? (
        <div className={`chat-row ${stylex.props(styles.row).className}`}>
          <div
            className={`chat-bubble chat-bubble--assistant ${stylex.props(styles.bubble, styles.assistantBubble).className}`}
          >
            <Markdown variant="chat" streaming>
              {streamText}
            </Markdown>
          </div>
        </div>
      ) : null}
      {busy && !streamText && !liveTools.some((tool) => tool.status === 'start') ? (
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
      ) : null}
      {!stuck && busy ? (
        <button
          type="button"
          className={`chat-scroll-bottom ${stylex.props(styles.scrollBottom).className}`}
          aria-label="回到底部"
          onClick={() => {
            const element = bodyRef.current;
            if (!element) return;
            stickRef.current = true;
            setStuck(true);
            element.scrollTop = element.scrollHeight;
          }}
        >
          <ArrowDown size={14} />
        </button>
      ) : null}
    </ScrollArea>
  );
}

export const ConversationTranscript = memo(ConversationTranscriptView);
