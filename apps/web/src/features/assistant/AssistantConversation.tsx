import { gsap } from 'gsap';
import { AtSign } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, SyntheticEvent } from 'react';
import { canvasSlugFromResearchPath, researchCanvasPath } from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { navigate } from '@web/lib/router';
import { Select } from '@web/ui';
import { CanvasSplit } from '../canvas/CanvasSplit';
import { latestCanvasChangeToken } from '../canvas/canvasEntries';
import { useCanvasWorkspace } from '../canvas/useCanvasWorkspace';
import { ChatComposer } from '../cockpit/chat/ChatComposer';
import { ConversationTranscript } from '../cockpit/chat/ConversationTranscript';
import { useAssistantChatSession } from '../cockpit/chat/useChatSession';
import type { MentionCandidate, MentionTrigger } from './atMention.js';
import type { AssistantModelChoice } from './assistantModels';
import {
  detectMentionTrigger,
  filterMentionCandidates,
  findMentionedCandidates,
  insertMention,
  removeMention,
} from './atMention.js';
import { AtMentionPopover } from './AtMentionPopover';
import { shouldExpandComposer } from './composerExpansion';
import { ComposerReferences } from './ComposerReferences';
import { MessageQueueList } from './MessageQueueList';
import { decideSubmitAction } from './messageQueue.js';
import { useMessageQueue } from './useMessageQueue.js';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';

const HEAD_FADE_SCROLL_PX = 32;

const styles = stylex.create({
  conversation: {
    backgroundColor: colors.backgroundCanvas,
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  head: {
    'alignItems': 'center',
    'display': 'flex',
    'height': sizes.paneHeaderHeight,
    'left': 0,
    'padding': '0 max(12px, calc((100% - 68ch) / 2))',
    'pointerEvents': 'none',
    'position': 'absolute',
    'right': 0,
    'top': 0,
    'zIndex': 5,
    '@media (max-width: 720px)': {
      paddingLeft: '8px',
      paddingRight: '8px',
    },
  },
  headBackdrop: {
    opacity: 'var(--assistant-head-fade, 1)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: '12px',
    bottom: '-56px',
    backgroundImage: `linear-gradient(to bottom, ${colors.backgroundCanvas} 36%, transparent)`,
    backdropFilter: 'blur(12px)',
    maskImage: 'linear-gradient(to bottom, #000 36%, transparent)',
  },
  headLeading: {
    display: 'inline-flex',
    flex: '0 0 auto',
    marginRight: '6px',
    pointerEvents: 'auto',
    position: 'relative',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: 600,
    lineHeight: 1.2,
    minWidth: 0,
    overflow: 'hidden',
    pointerEvents: 'auto',
    position: 'relative',
    textOverflow: 'ellipsis',
    textWrap: 'balance',
    whiteSpace: 'nowrap',
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
  },
  dock: {
    'position': 'absolute',
    'bottom': 0,
    'left': 0,
    'right': 0,
    'padding': '8px max(12px, calc((100% - 68ch) / 2)) 10px',
    'pointerEvents': 'none',
    'zIndex': 5,
    '@media (max-width: 720px)': {
      paddingLeft: '8px',
      paddingRight: '8px',
    },
  },
  dockBackdrop: {
    position: 'absolute',
    top: '-36px',
    left: 0,
    right: '12px',
    bottom: 0,
    backgroundImage: `linear-gradient(to bottom, transparent, ${colors.backgroundCanvas} 44px)`,
    backdropFilter: 'blur(14px)',
    maskImage: 'linear-gradient(to bottom, transparent, #000 44px)',
  },
  dockInner: {
    minWidth: 0,
    pointerEvents: 'auto',
    position: 'relative',
  },
  composerWrap: {
    position: 'relative',
  },
  mentionLayer: {
    bottom: 'calc(100% + 6px)',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 8,
  },
  composer: {
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.borderStrong,
    'borderRadius': radii.composer,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'overflow': 'hidden',
    'padding': '8px',
    'position': 'relative',
    'display': 'grid',
    'gridTemplateColumns': 'minmax(0, 1fr)',
    'gridTemplateAreas': '"refs" "field" "meta"',
    'alignItems': 'center',
    'transitionDuration': '120ms',
    'transitionProperty': 'border-color, box-shadow',
    'transitionTimingFunction': 'ease',
    ':focus-within': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
    },
  },
  transcriptContent: {
    'gap': '12px',
    'minHeight': '100%',
    'padding': '16px max(12px, calc((100% - 68ch) / 2))',
    'paddingTop': `calc(${sizes.paneHeaderHeight} + 44px)`,
    'paddingBottom': 'calc(var(--assistant-dock-height, 0px) + 28px)',
    '@media (max-width: 720px)': {
      paddingLeft: '8px',
      paddingRight: '8px',
    },
  },
  transcriptEmpty: {
    flex: '1 1 auto',
    justifyContent: 'center',
  },
  transcriptEmptyText: {
    maxWidth: '360px',
    textAlign: 'center',
    textWrap: 'pretty',
  },
  composerLayout: {
    padding: 0,
  },
  composerField: {
    'backgroundColor': 'transparent',
    'borderRadius': 0,
    'borderStyle': 'none',
    'borderWidth': 0,
    'caretColor': colors.accent,
    'color': colors.textPrimary,
    'fieldSizing': 'content',
    'fontSize': fontSizes.base,
    'height': 'auto',
    'lineHeight': 1.5,
    'maxHeight': '132px',
    'minHeight': sizes.controlHeight,
    'gridArea': 'field',
    'overflowY': 'auto',
    'padding': '4px 40px 4px 8px',
    'resize': 'none',
    'textWrap': 'pretty',
    '::placeholder': {
      color: colors.textMuted,
    },
    ':focus': {
      borderStyle: 'none',
      borderWidth: 0,
      boxShadow: 'none',
      outline: 'none',
    },
    ':focus-visible': {
      borderStyle: 'none',
      borderWidth: 0,
      boxShadow: 'none',
      outline: 'none',
    },
  },
  composerFieldExpanded: {
    minHeight: '60px',
  },
  composerHint: {
    color: colors.down,
    padding: '4px 8px 2px',
    textWrap: 'pretty',
  },
  userBubble: {
    borderRadius: radii.userBubble,
  },
  composerAction: {
    'borderRadius': radii.full,
    'flexShrink': 0,
    'height': sizes.controlHeight,
    'position': 'relative',
    'width': sizes.controlHeight,
    '::after': {
      content: "''",
      height: '40px',
      left: '50%',
      position: 'absolute',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: '40px',
    },
  },
  composerStopAction: {
    backgroundColor: colors.down,
    borderColor: 'transparent',
    color: colors.textBright,
  },
  composerSendIcon: {
    marginLeft: '1px',
  },
  composerExpanded: {
    borderColor: colors.focusBorder,
    boxShadow: colors.focusRing,
  },
  composerMeta: {
    'alignItems': 'center',
    'display': 'flex',
    'flexGrow': 0,
    'flexShrink': 1,
    'flexBasis': 'auto',
    'gap': '10px',
    'height': 0,
    'justifyContent': 'space-between',
    'marginTop': 0,
    'minHeight': 0,
    'minWidth': 0,
    'opacity': 0,
    'overflow': 'hidden',
    'gridArea': 'meta',
    'padding': '0 8px 0 4px',
    'pointerEvents': 'none',
    'transform': 'translateY(4px)',
    'transitionDuration': '140ms',
    'transitionProperty': 'opacity, transform',
    'transitionTimingFunction': 'ease-out',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
    },
  },
  composerMetaExpanded: {
    height: 'auto',
    minHeight: sizes.controlHeight,
    opacity: 1,
    overflow: 'visible',
    pointerEvents: 'auto',
    transform: 'translateY(0)',
  },
  contextAction: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.full,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.xs,
    'gap': '5px',
    'height': sizes.controlHeight,
    'padding': '0 6px',
    'transitionDuration': '120ms',
    'transitionProperty': 'color, background-color, scale',
    'transitionTimingFunction': 'ease-out',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textSecondary,
    },
    ':active': {
      scale: 0.96,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
    },
  },
  tools: {
    alignItems: 'center',
    display: 'flex',
    gap: '4px',
    minWidth: 0,
  },
  modelSelect: {
    'backgroundColor': 'transparent',
    'borderColor': 'transparent',
    'borderRadius': radii.full,
    'borderStyle': 'none',
    'borderWidth': 0,
    'boxShadow': 'none',
    'color': colors.textMuted,
    'alignItems': 'center',
    'fontSize': fontSizes.xs,
    'height': sizes.controlHeight,
    'justifyContent': 'flex-end',
    'lineHeight': sizes.controlHeight,
    'maxWidth': 'min(220px, 42vw)',
    'padding': 0,
    'width': 'auto',
    ':hover:not([disabled])': {
      backgroundColor: 'transparent',
      color: colors.textSecondary,
    },
  },
  modelSelectOpen: {
    backgroundColor: 'transparent',
    color: colors.textSecondary,
  },
  composerEnd: {
    alignItems: 'center',
    bottom: '8px',
    display: 'flex',
    gap: '6px',
    height: sizes.controlHeight,
    pointerEvents: 'auto',
    position: 'absolute',
    right: '8px',
    zIndex: 1,
  },
  composerActionSlot: {
    display: 'contents',
  },
  modelError: {
    color: colors.down,
    fontSize: fontSizes.xs,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

interface MentionState {
  trigger: MentionTrigger;
  activeIndex: number;
}

export function AssistantConversation({
  sessionId,
  sessionTitle,
  refreshSessions,
  mentionCandidates,
  linkedCanvas,
  modelChoices,
  selectedModelValue,
  modelSaving,
  modelError,
  modelLabels,
  onModelChange,
  focusRequest = 0,
  headLeading,
}: {
  sessionId: string;
  sessionTitle?: string;
  refreshSessions: () => void;
  mentionCandidates: MentionCandidate[];
  linkedCanvas: MentionCandidate | null;
  modelChoices: AssistantModelChoice[];
  selectedModelValue: string;
  modelSaving: boolean;
  modelError: string | null;
  modelLabels: Readonly<Record<string, string>>;
  onModelChange: (value: string) => void;
  focusRequest?: number;
  headLeading?: ReactNode;
}) {
  const {
    session,
    rows,
    busy,
    aborting,
    streamText,
    liveTools,
    liveBeats,
    hint,
    send,
    retryLast,
    replaceLast,
    abort,
  } = useAssistantChatSession(sessionId);
  const linkedCanvasSlug = linkedCanvas ? canvasSlugFromResearchPath(linkedCanvas.path) : null;
  const canvas = useCanvasWorkspace(linkedCanvasSlug);
  const canvasReloadKey = latestCanvasChangeToken(rows, liveTools);
  const [text, setText] = useState('');
  const dockRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const headFadeRef = useRef(-1);
  const onViewportScroll = useCallback((scrollTop: number) => {
    const fade = Math.min(1, scrollTop / HEAD_FADE_SCROLL_PX);
    if (fade === headFadeRef.current) return;
    headFadeRef.current = fade;
    conversationRef.current?.style.setProperty('--assistant-head-fade', fade.toFixed(3));
  }, []);
  const [dockHeight, setDockHeight] = useState(0);
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const Observer = globalThis.ResizeObserver;
    if (!dock || !Observer) return;
    const observer = new Observer(() => {
      setDockHeight(dock.offsetHeight);
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const wasBusyRef = useRef(busy);
  const cursorRef = useRef(text.length);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerTargetHeightRef = useRef<number | null>(null);
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (wasBusyRef.current !== busy) refreshSessions();
    wasBusyRef.current = busy;
  }, [busy, refreshSessions]);

  useEffect(() => {
    if (focusRequest > 0) textareaRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (session?.title) refreshSessions();
  }, [session?.title, refreshSessions]);

  const doSend = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, error: '内容不能为空' };
    const linkedMention = linkedCanvas ? `@${linkedCanvas.path}` : null;
    const message =
      linkedMention && !trimmed.includes(linkedMention) ? `${linkedMention}\n${trimmed}` : trimmed;
    return send(message);
  };

  const [editing, setEditing] = useState(false);
  const queue = useMessageQueue({ busy, paused: editing, onSend: doSend });

  const filteredMentions = mentionState
    ? filterMentionCandidates(mentionCandidates, mentionState.trigger.query)
    : [];
  const mentionedCandidates = useMemo(() => {
    const mentioned = findMentionedCandidates(text, mentionCandidates);
    if (!linkedCanvas || mentioned.some((candidate) => candidate.path === linkedCanvas.path)) {
      return mentioned;
    }
    return [linkedCanvas, ...mentioned];
  }, [linkedCanvas, mentionCandidates, text]);
  const composerExpanded = shouldExpandComposer({
    busy,
    focusedWithin: composerFocused,
    hasHint: Boolean(hint),
    hasReferences: mentionedCandidates.length > 0,
    hasText: text.trim().length > 0,
    modelPickerOpen,
    queueLength: queue.queue.length,
  });

  useLayoutEffect(() => {
    const element = composerRef.current;
    if (!element) return;

    const previousTarget = composerTargetHeightRef.current;
    const inlineHeight = element.style.height;
    const renderedHeight = element.getBoundingClientRect().height;
    const fromHeight =
      inlineHeight && inlineHeight !== 'auto' ? renderedHeight : (previousTarget ?? renderedHeight);

    gsap.killTweensOf(element);
    gsap.set(element, { height: 'auto' });
    const targetHeight = element.getBoundingClientRect().height;
    composerTargetHeightRef.current = targetHeight;

    if (previousTarget === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(element, { clearProps: 'height,overflow' });
      return;
    }

    gsap.fromTo(
      element,
      { height: fromHeight, overflow: 'hidden' },
      {
        height: targetHeight,
        duration: 0.24,
        ease: 'power2.out',
        overwrite: true,
        onComplete: () => gsap.set(element, { clearProps: 'height,overflow' }),
      },
    );
  }, [composerExpanded]);

  useEffect(
    () => () => {
      if (composerRef.current) gsap.killTweensOf(composerRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const focusComposer = () => textareaRef.current?.focus();
    focusComposer();
    if (!linkedCanvasSlug) return;

    const reclaimIfCanvasIframe = (target: EventTarget | null) => {
      if (!(target instanceof HTMLIFrameElement) || target.title !== 'canvas') return;
      if (document.activeElement === target) focusComposer();
    };
    let frame = 0;
    const onLoad = (event: Event) => {
      const target = event.target;
      frame = requestAnimationFrame(() => reclaimIfCanvasIframe(target));
    };
    document.addEventListener('load', onLoad, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('load', onLoad, true);
    };
  }, [sessionId, linkedCanvasSlug]);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setText('');
    setMentionState(null);
    if (decideSubmitAction(busy, queue.queue.length) === 'enqueue') {
      queue.enqueue(trimmed);
      return;
    }
    void doSend(trimmed).then((result) => {
      if (!result.ok) setText(trimmed);
    });
  };

  const syncCursor = (value: string, selectionStart: number | null) => {
    const cursor = selectionStart ?? value.length;
    cursorRef.current = cursor;
    setMentionState((current) => {
      const trigger = detectMentionTrigger(value, cursor);
      if (!trigger) return null;
      if (current && current.trigger.start === trigger.start)
        return { trigger, activeIndex: current.activeIndex };
      return { trigger, activeIndex: 0 };
    });
  };

  const syncCursorFromEvent = (event: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    syncCursor(event.currentTarget.value, event.currentTarget.selectionStart);
  };

  const pickMention = (candidate: MentionCandidate) => {
    if (!mentionState) return;
    const result = insertMention(text, cursorRef.current, mentionState.trigger, candidate.path);
    setText(result.text);
    cursorRef.current = result.cursor;
    setMentionState(null);
    const slug = canvasSlugFromResearchPath(candidate.path);
    if (slug) {
      navigate(
        `/chat?${new URLSearchParams({ session: sessionId, canvas: candidate.path }).toString()}`,
        { replace: true },
      );
    }
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const openMentionPicker = () => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const needsLeadingSpace = cursor > 0 && !/\s/.test(text[cursor - 1] ?? '');
    const inserted = `${needsLeadingSpace ? ' ' : ''}@`;
    const next = text.slice(0, cursor) + inserted + text.slice(cursor);
    const nextCursor = cursor + inserted.length;
    setText(next);
    syncCursor(next, nextCursor);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const removeReference = (path: string) => {
    const next = removeMention(text, path);
    setText(next);
    setMentionState(null);
    if (path === linkedCanvas?.path) {
      canvas.close();
      navigate(`/chat?${new URLSearchParams({ session: sessionId }).toString()}`, {
        replace: true,
      });
    }
    cursorRef.current = next.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.length, next.length);
    });
  };

  return (
    <CanvasSplit
      openSlug={canvas.openSlug}
      onClose={canvas.close}
      reloadKey={canvasReloadKey}
      storageKey="canvas-assistant-pane"
    >
      <div
        ref={conversationRef}
        className={`assistant-conversation ${stylex.props(styles.conversation).className}`}
        style={
          {
            '--assistant-dock-height': `${dockHeight}px`,
            '--scroll-area-inset-bottom': `${dockHeight}px`,
            '--assistant-head-fade': 0,
          } as CSSProperties
        }
      >
        <div className={`assistant-conversation-head ${stylex.props(styles.head).className}`}>
          <div {...stylex.props(styles.headBackdrop)} aria-hidden="true" />
          {headLeading ? <div {...stylex.props(styles.headLeading)}>{headLeading}</div> : null}
          <span className={`assistant-conversation-title ${stylex.props(styles.title).className}`}>
            {sessionTitle ?? session?.title ?? '新的会话'}
          </span>
        </div>
        <ConversationTranscript
          className={`assistant-conversation-body ${stylex.props(styles.body).className}`}
          contentClassName={stylex.props(styles.transcriptContent).className}
          emptyClassName={stylex.props(styles.transcriptEmpty).className}
          emptyTextClassName={stylex.props(styles.transcriptEmptyText).className}
          rows={rows}
          busy={busy}
          streamText={streamText}
          liveTools={liveTools}
          liveBeats={liveBeats}
          suggestions={[]}
          emptyText="输入问题、判断或交易计划，开始一段研究对话"
          onPickSuggestion={() => {}}
          modelLabels={modelLabels}
          onOpenCanvas={(slug) => {
            canvas.open(slug);
            navigate(
              `/chat?${new URLSearchParams({ session: sessionId, canvas: researchCanvasPath(slug) }).toString()}`,
              { replace: true },
            );
          }}
          userBubbleClassName={stylex.props(styles.userBubble).className}
          onRetryLast={() => void retryLast()}
          onReplaceLast={(value) => void replaceLast(value)}
          onEditingChange={setEditing}
          onViewportScroll={onViewportScroll}
        />
        <div
          ref={dockRef}
          className={`assistant-conversation-dock ${stylex.props(styles.dock).className}`}
        >
          <div {...stylex.props(styles.dockBackdrop)} aria-hidden="true" />
          <div
            className={`assistant-conversation-dock-inner ${stylex.props(styles.dockInner).className}`}
          >
            <MessageQueueList queue={queue.queue} onRemove={queue.remove} />
            <div
              className={`assistant-conversation-composer-wrap ${stylex.props(styles.composerWrap).className}`}
            >
              {mentionState ? (
                <div {...stylex.props(styles.mentionLayer)}>
                  <AtMentionPopover
                    candidates={filteredMentions}
                    activeIndex={mentionState.activeIndex}
                    onPick={pickMention}
                  />
                </div>
              ) : null}
              <div
                ref={composerRef}
                className={`assistant-conversation-composer ${stylex.props(styles.composer, composerExpanded && styles.composerExpanded).className}`}
                data-expanded={composerExpanded ? '' : undefined}
                onFocusCapture={() => setComposerFocused(true)}
                onBlurCapture={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    setComposerFocused(false);
                  }
                }}
              >
                <ComposerReferences references={mentionedCandidates} onRemove={removeReference} />
                <ChatComposer
                  value={text}
                  onChange={setText}
                  busy={busy}
                  aborting={aborting}
                  allowInputWhileBusy
                  disabled={modelSaving || editing}
                  multiline
                  textareaRef={textareaRef}
                  placeholder="写下问题、判断或行动要求，@ 引用研究资料…"
                  onSubmit={submit}
                  onAbort={() => void abort()}
                  hint={hint}
                  layoutClassName={stylex.props(styles.composerLayout).className}
                  fieldClassName={
                    stylex.props(
                      styles.composerField,
                      composerExpanded && styles.composerFieldExpanded,
                    ).className
                  }
                  hintClassName={stylex.props(styles.composerHint).className}
                  actionSlot={actionSlot}
                  actionClassName={
                    stylex.props(styles.composerAction, busy && styles.composerStopAction).className
                  }
                  actionIconClassName={
                    !busy ? stylex.props(styles.composerSendIcon).className : undefined
                  }
                  onValueDetail={(value, selectionStart) => syncCursor(value, selectionStart)}
                  inputProps={{
                    autoFocus: true,
                    onKeyUp: syncCursorFromEvent,
                    onClick: syncCursorFromEvent,
                    onSelect: syncCursorFromEvent,
                  }}
                  onKeyDownIntercept={(event) => {
                    if (!mentionState || filteredMentions.length === 0) return false;
                    if (event.key === 'Escape') {
                      setMentionState(null);
                      event.preventDefault();
                      return true;
                    }
                    if (event.key === 'ArrowDown') {
                      setMentionState((current) =>
                        current
                          ? {
                              ...current,
                              activeIndex: Math.min(
                                current.activeIndex + 1,
                                filteredMentions.length - 1,
                              ),
                            }
                          : current,
                      );
                      event.preventDefault();
                      return true;
                    }
                    if (event.key === 'ArrowUp') {
                      setMentionState((current) =>
                        current
                          ? { ...current, activeIndex: Math.max(current.activeIndex - 1, 0) }
                          : current,
                      );
                      event.preventDefault();
                      return true;
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const candidate = filteredMentions[mentionState.activeIndex];
                      if (candidate) pickMention(candidate);
                      return true;
                    }
                    return false;
                  }}
                />
                <div className={stylex.props(styles.composerEnd).className}>
                  {composerExpanded ? (
                    <Select
                      value={selectedModelValue}
                      options={modelChoices}
                      onChange={onModelChange}
                      className={`assistant-model-select ${stylex.props(styles.modelSelect, modelPickerOpen && styles.modelSelectOpen).className}`}
                      style={{
                        alignItems: 'center',
                        backgroundColor: 'transparent',
                        borderColor: 'transparent',
                        borderStyle: 'none',
                        borderWidth: 0,
                        boxShadow: 'none',
                        display: 'inline-flex',
                        height: 28,
                        lineHeight: '28px',
                        padding: 0,
                      }}
                      disabled={modelSaving || modelChoices.length === 0}
                      ariaLabel="选择对话模型"
                      placeholder={modelChoices.length === 0 ? '未配置模型' : '选择模型'}
                      onOpenChange={setModelPickerOpen}
                    />
                  ) : null}
                  <div
                    ref={setActionSlot}
                    className={stylex.props(styles.composerActionSlot).className}
                  />
                </div>
                <div
                  className="assistant-conversation-composer-meta"
                  {...stylex.props(
                    styles.composerMeta,
                    composerExpanded && styles.composerMetaExpanded,
                  )}
                  aria-hidden={!composerExpanded}
                  inert={!composerExpanded}
                >
                  <div
                    className={`assistant-composer-tools ${stylex.props(styles.tools).className}`}
                  >
                    <button
                      type="button"
                      className={`assistant-composer-context-action ${stylex.props(styles.contextAction).className}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={openMentionPicker}
                    >
                      <AtSign size={13} aria-hidden="true" /> 引用资料
                    </button>
                  </div>
                  {modelError ? (
                    <span
                      className={`assistant-model-error ${stylex.props(styles.modelError).className}`}
                      role="alert"
                    >
                      {modelError}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CanvasSplit>
  );
}
