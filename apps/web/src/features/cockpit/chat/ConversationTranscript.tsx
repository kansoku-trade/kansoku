import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { ScrollArea } from '@web/ui';
import { colors, fontSizes, radii, sizes } from '../../../theme/tokens.stylex';
import type { TranscriptInsert } from './transcriptTimeline.js';
import { blockKey, presentTranscript } from './presentTranscript.js';
import { TranscriptBlockView } from './TranscriptBlockView.js';
import { lastUserRow, type ChatLiveBeat, type ChatLiveTool, type ChatRow } from './useChatSession';

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
    'bottom': 'calc(var(--assistant-dock-height, 0px) + 6px)',
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
    'borderRadius': radii.full,
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
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  suggestion: {
    'fontSize': fontSizes.sm,
    'color': colors.textSecondary,
    'backgroundColor': 'transparent',
    'borderColor': colors.borderStrong,
    'borderStyle': 'dashed',
    'borderWidth': '1px',
    'borderRadius': radii.full,
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
const ANCHOR_SCROLL_SMOOTH_MS = 450;

function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function scrollToBottom(viewport: HTMLElement, smooth: boolean): void {
  if (smooth && typeof viewport.scrollTo === 'function') {
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    return;
  }
  viewport.scrollTop = viewport.scrollHeight;
}
const EMPTY_INSERTS: TranscriptInsert[] = [];

function ConversationTranscriptView({
  rows,
  inserts = EMPTY_INSERTS,
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
  full = false,
  canvasOpen = false,
  userBubbleClassName,
  suggestionClassName,
  emptyClassName,
  emptyTextClassName,
  insertClassName,
  modelLabels,
  onOpenCanvas,
  onRetryLast,
  onEditLast,
  onReplaceLast,
  onEditingChange,
  onViewportScroll,
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
  full?: boolean;
  canvasOpen?: boolean;
  userBubbleClassName?: string;
  suggestionClassName?: string;
  emptyClassName?: string;
  emptyTextClassName?: string;
  insertClassName?: string;
  modelLabels?: Readonly<Record<string, string>>;
  onOpenCanvas?: (slug: string) => void;
  onRetryLast?: () => void;
  onEditLast?: () => void;
  onReplaceLast?: (text: string) => void;
  onEditingChange?: (editing: boolean) => void;
  onViewportScroll?: (scrollTop: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const streamSpaceRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const smoothUntilRef = useRef(0);
  const anchoredUserIdRef = useRef<string | null>(null);
  const [stuck, setStuck] = useState(true);
  const blocks = useMemo(
    () => presentTranscript({ rows, inserts, liveBeats, liveTools, streamText, busy }),
    [rows, inserts, liveBeats, liveTools, streamText, busy],
  );
  const activeUserId = useMemo(() => {
    if (!busy) return undefined;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index]?.kind === 'user') return rows[index]?.id;
    }
    return undefined;
  }, [busy, rows]);
  const lastAssistantIndex = useMemo(() => {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      if (blocks[index]?.type === 'assistant') return index;
    }
    return -1;
  }, [blocks]);
  const lastUserId = lastUserRow(rows)?.id;
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (busy) setEditingId(null);
  }, [busy]);

  useEffect(() => {
    if (editingId && lastUserId && editingId !== lastUserId) setEditingId(null);
  }, [editingId, lastUserId]);

  useEffect(() => {
    onEditingChange?.(editingId !== null);
  }, [editingId, onEditingChange]);

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
      smoothUntilRef.current = reducedMotion() ? 0 : performance.now() + ANCHOR_SCROLL_SMOOTH_MS;
    }
    // Later syncs inside the window must stay smooth: an instant jump mid-scroll cancels it.
    if (stickRef.current) scrollToBottom(viewport, performance.now() < smoothUntilRef.current);
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
        onViewportScroll?.(element.scrollTop);
        const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
        const scrolledUp = element.scrollTop < lastScrollTopRef.current && distance > 1;
        lastScrollTopRef.current = element.scrollTop;
        // Any upward scroll releases the follow, however small; only reaching the
        // bottom again re-engages it. A distance threshold alone snaps small scrolls back.
        const next = scrolledUp ? false : distance < SCROLL_STICK_THRESHOLD;
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
                  className={`chat-suggestion ${stylex.props(styles.suggestion).className}${suggestionClassName ? ` ${suggestionClassName}` : ''}`}
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
          modelLabels={modelLabels}
          userBubbleClassName={userBubbleClassName}
          insertClassName={insertClassName}
          onOpenCanvas={onOpenCanvas}
          onRetry={onRetryLast}
          showActions={
            block.type === 'assistant' && !block.streaming && !busy && index === lastAssistantIndex
          }
          showUserActions={block.type === 'user'}
          userActions={
            block.type === 'user' && block.row.id === lastUserId
              ? {
                  onRetry: onRetryLast,
                  onEdit: onReplaceLast ? () => setEditingId(lastUserId) : onEditLast,
                  retryDisabled: busy,
                  editDisabled: busy,
                }
              : {}
          }
          editing={block.type === 'user' && block.row.id === editingId}
          onSubmitEdit={(text) => {
            setEditingId(null);
            onReplaceLast?.(text);
          }}
          onCancelEdit={() => setEditingId(null)}
        />
      ))}
      {!isEmpty && !busy && suggestions.length > 0 ? (
        <div className={`chat-suggestions ${stylex.props(styles.suggestions).className}`}>
          {suggestions.map((question) => (
            <button
              type="button"
              key={question}
              className={`chat-suggestion ${stylex.props(styles.suggestion).className}${suggestionClassName ? ` ${suggestionClassName}` : ''}`}
              onClick={() => onPickSuggestion(question)}
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}
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
