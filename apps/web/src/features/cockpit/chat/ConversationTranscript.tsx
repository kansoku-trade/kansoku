import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { ScrollArea } from '@web/ui';
import { colors, fontSizes, radii, sizes } from '../../../theme/tokens.stylex';
import type { TranscriptInsert } from './transcriptTimeline.js';
import { blockKey, presentTranscript } from './presentTranscript.js';
import { TranscriptBlockView } from './TranscriptBlockView.js';
import type { ChatChromeVariant } from './ChatComposer';
import type { ChatLiveBeat, ChatLiveTool, ChatRow } from './useChatSession';

const styles = stylex.create({
  panelBodyContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  fullContext: {
    padding: '16px max(12px, calc((100% - 68ch) / 2))',
    gap: '12px',
  },
  canvasOpenContext: {
    paddingLeft: '16px',
    paddingRight: '16px',
  },
  transcriptViewport: {
    overflowAnchor: 'none',
  },
  streamSpace: {
    flexShrink: 0,
    pointerEvents: 'none',
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
    'cursor': 'pointer',
    ':hover': {
      borderColor: colors.borderStrong,
      color: colors.textPrimary,
    },
  },
  empty: {
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  emptyText: {
    fontSize: fontSizes.base,
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
    'padding': '4px 9px',
    'cursor': 'pointer',
    ':hover': {
      color: colors.textPrimary,
      borderColor: colors.accent,
      borderStyle: 'solid',
    },
  },
});

const suggestionChrome = stylex.create({
  assistant: {
    borderRadius: radii.full,
  },
  panel: {
    borderRadius: radii.default,
  },
});

const scrollBottomChrome = stylex.create({
  assistant: {
    borderRadius: radii.full,
  },
  panel: {
    borderRadius: radii.md,
  },
});

const SCROLL_STICK_THRESHOLD = 48;

function ConversationTranscriptView({
  rows,
  inserts = [],
  busy,
  streamText,
  liveTools,
  liveBeats,
  suggestions,
  emptyText,
  onPickSuggestion,
  className,
  viewportClassName,
  contentClassName,
  variant = 'assistant',
  full = false,
  canvasOpen = false,
  userBubbleClassName,
  suggestionClassName,
  emptyClassName,
  emptyTextClassName,
  insertClassName,
  modelLabels,
  onOpenCanvas,
}: {
  rows: ChatRow[];
  inserts?: TranscriptInsert[];
  busy: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  liveBeats?: ChatLiveBeat[];
  suggestions: string[];
  emptyText: string;
  onPickSuggestion: (question: string) => void;
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
  variant?: ChatChromeVariant;
  full?: boolean;
  canvasOpen?: boolean;
  userBubbleClassName?: string;
  suggestionClassName?: string;
  emptyClassName?: string;
  emptyTextClassName?: string;
  insertClassName?: string;
  modelLabels?: Readonly<Record<string, string>>;
  onOpenCanvas?: (slug: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const streamSpaceRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const anchoredUserIdRef = useRef<string | null>(null);
  const [stuck, setStuck] = useState(true);
  const blocks = useMemo(
    () => presentTranscript({ rows, inserts, liveBeats, liveTools, streamText, busy }),
    [rows, inserts, liveBeats, liveTools, streamText, busy],
  );
  const activeUserId = useMemo(
    () => (busy ? rows.findLast((row) => row.kind === 'user')?.id : undefined),
    [busy, rows],
  );

  const syncActiveTurn = useCallback(() => {
    const viewport = bodyRef.current;
    const spacer = streamSpaceRef.current;
    if (!viewport || !spacer || !activeUserId) return;

    const userRows = viewport.getElementsByClassName('chat-row--user');
    const userRow = userRows.item(userRows.length - 1);
    const content = spacer.parentElement;
    if (!(userRow instanceof HTMLElement) || !content) return;

    const paddingTop = Number.parseFloat(getComputedStyle(content).paddingTop) || 0;
    const targetScrollTop = Math.max(
      0,
      viewport.scrollTop +
        userRow.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        paddingTop,
    );
    const currentSpacerHeight = spacer.getBoundingClientRect().height;
    const nextSpacerHeight = Math.max(
      0,
      Math.ceil(
        targetScrollTop + viewport.clientHeight - (viewport.scrollHeight - currentSpacerHeight),
      ),
    );
    const nextHeight = `${nextSpacerHeight}px`;
    if (spacer.style.height !== nextHeight) spacer.style.height = nextHeight;

    if (anchoredUserIdRef.current !== activeUserId) {
      anchoredUserIdRef.current = activeUserId;
      stickRef.current = true;
    }
    if (stickRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [activeUserId]);

  useLayoutEffect(() => {
    if (activeUserId) {
      syncActiveTurn();
      return;
    }
    const viewport = bodyRef.current;
    if (viewport && stickRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [activeUserId, blocks, syncActiveTurn]);

  useEffect(() => {
    const viewport = bodyRef.current;
    const spacer = streamSpaceRef.current;
    const Observer = globalThis.ResizeObserver;
    if (!activeUserId || !viewport || !spacer || !Observer) return;

    const observer = new Observer(syncActiveTurn);
    observer.observe(viewport);
    if (spacer.parentElement) observer.observe(spacer.parentElement);
    return () => observer.disconnect();
  }, [activeUserId, syncActiveTurn]);

  const isEmpty =
    rows.length === 0 &&
    inserts.length === 0 &&
    liveTools.length === 0 &&
    !streamText &&
    !liveBeats?.length;

  return (
    <ScrollArea
      className={className}
      viewportClassName={`chat-transcript-viewport ${stylex.props(styles.transcriptViewport).className}${viewportClassName ? ` ${viewportClassName}` : ''}`}
      contentClassName={`chat-panel-body-content ${stylex.props(styles.panelBodyContent, full && styles.fullContext, canvasOpen && styles.canvasOpenContext).className}${contentClassName ? ` ${contentClassName}` : ''}`}
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
        <div
          className={`chat-empty ${stylex.props(styles.empty).className}${emptyClassName ? ` ${emptyClassName}` : ''}`}
        >
          <div
            className={`chat-empty-text ${stylex.props(styles.emptyText).className}${emptyTextClassName ? ` ${emptyTextClassName}` : ''}`}
          >
            {emptyText}
          </div>
          {suggestions.length > 0 ? (
            <div className={`chat-suggestions ${stylex.props(styles.suggestions).className}`}>
              {suggestions.map((question) => (
                <button
                  type="button"
                  key={question}
                  className={`chat-suggestion ${stylex.props(styles.suggestion, suggestionChrome[variant]).className}${suggestionClassName ? ` ${suggestionClassName}` : ''}`}
                  onClick={() => onPickSuggestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {blocks.map((block, index) => (
        <TranscriptBlockView
          key={blockKey(block, index)}
          block={block}
          variant={variant}
          modelLabels={modelLabels}
          userBubbleClassName={userBubbleClassName}
          insertClassName={insertClassName}
          onOpenCanvas={onOpenCanvas}
        />
      ))}
      {activeUserId ? (
        <div
          ref={streamSpaceRef}
          className={`chat-stream-space ${stylex.props(styles.streamSpace).className}`}
          aria-hidden="true"
        />
      ) : null}
      {!stuck && busy ? (
        <button
          type="button"
          className={`chat-scroll-bottom ${stylex.props(styles.scrollBottom, scrollBottomChrome[variant]).className}`}
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
