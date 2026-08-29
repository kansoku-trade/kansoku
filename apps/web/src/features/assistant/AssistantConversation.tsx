import { gsap } from 'gsap';
import { AtSign } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Kbd, Select } from '@web/ui';
import { CanvasSplit } from '../canvas/CanvasSplit';
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
  },
  head: {
    'alignItems': 'center',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'display': 'flex',
    'flexGrow': 0,
    'flexShrink': 0,
    'flexBasis': 'auto',
    'minHeight': '44px',
    'padding': '0 max(12px, calc((100% - 68ch) / 2))',
    '@media (max-width: 720px)': {
      paddingLeft: '8px',
      paddingRight: '8px',
    },
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: 600,
    lineHeight: 1.2,
    minWidth: 0,
    overflow: 'hidden',
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
    'flexGrow': 0,
    'flexShrink': 0,
    'flexBasis': 'auto',
    'padding': '8px max(12px, calc((100% - 68ch) / 2)) 10px',
    'position': 'relative',
    'zIndex': 5,
    '@media (max-width: 720px)': {
      paddingLeft: '8px',
      paddingRight: '8px',
    },
  },
  dockInner: {
    minWidth: 0,
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
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'padding': '4px',
    'position': 'relative',
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
    'padding': '0 4px',
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
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    height: 'auto',
    marginTop: '4px',
    minHeight: sizes.controlHeight,
    opacity: 1,
    overflow: 'visible',
    paddingTop: '4px',
    pointerEvents: 'auto',
    transform: 'translateY(0)',
  },
  contextAction: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.default,
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
    'color': colors.textMuted,
    'fontSize': fontSizes.xs,
    'justifyContent': 'space-between',
    'width': 'min(190px, 32vw)',
    ':hover:not([disabled])': {
      borderColor: colors.border,
      color: colors.textSecondary,
    },
    '@media (max-width: 720px)': {
      width: 'min(150px, 38vw)',
    },
  },
  modelSelectOpen: {
    borderColor: colors.border,
    color: colors.textSecondary,
  },
  status: {
    alignItems: 'center',
    display: 'flex',
    gap: '10px',
    minWidth: 0,
  },
  modelError: {
    color: colors.down,
    fontSize: fontSizes.xs,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  shortcut: {
    'color': colors.textMuted,
    'fontSize': '9px',
    'whiteSpace': 'nowrap',
    '@media (max-width: 920px)': {
      display: 'none',
    },
  },
});

interface MentionState {
  trigger: MentionTrigger;
  activeIndex: number;
}

export function AssistantConversation({
  sessionId,
  refreshSessions,
  mentionCandidates,
  modelChoices,
  selectedModelValue,
  modelSaving,
  modelError,
  modelLabels,
  onModelChange,
}: {
  sessionId: string;
  refreshSessions: () => void;
  mentionCandidates: MentionCandidate[];
  modelChoices: AssistantModelChoice[];
  selectedModelValue: string;
  modelSaving: boolean;
  modelError: string | null;
  modelLabels: Readonly<Record<string, string>>;
  onModelChange: (value: string) => void;
}) {
  const { session, rows, busy, aborting, streamText, liveTools, hint, send, abort } =
    useAssistantChatSession(sessionId);
  const canvas = useCanvasWorkspace();
  const [text, setText] = useState('');
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const wasBusyRef = useRef(busy);
  const cursorRef = useRef(text.length);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerTargetHeightRef = useRef<number | null>(null);

  useEffect(() => {
    if (wasBusyRef.current && !busy) refreshSessions();
    wasBusyRef.current = busy;
  }, [busy, refreshSessions]);

  const doSend = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, error: '内容不能为空' };
    return send(trimmed);
  };

  const queue = useMessageQueue({ busy, onSend: doSend });

  const filteredMentions = mentionState
    ? filterMentionCandidates(mentionCandidates, mentionState.trigger.query)
    : [];
  const mentionedCandidates = useMemo(
    () => findMentionedCandidates(text, mentionCandidates),
    [mentionCandidates, text],
  );
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
    cursorRef.current = next.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.length, next.length);
    });
  };

  return (
    <CanvasSplit
      openSlug={canvas.openSlug}
      view={canvas.view}
      onClose={canvas.close}
      onViewChange={canvas.setView}
      storageKey="canvas-assistant-pane"
    >
      <div className={`assistant-conversation ${stylex.props(styles.conversation).className}`}>
        <div className={`assistant-conversation-head ${stylex.props(styles.head).className}`}>
          <span className={`assistant-conversation-title ${stylex.props(styles.title).className}`}>
            {session?.title ?? '新的会话'}
          </span>
        </div>
        <ConversationTranscript
          className={`assistant-conversation-body ${stylex.props(styles.body).className}`}
          rows={rows}
          busy={busy}
          streamText={streamText}
          liveTools={liveTools}
          suggestions={[]}
          emptyText="输入问题、判断或交易计划，开始一段研究对话"
          onPickSuggestion={() => {}}
          modelLabels={modelLabels}
          onOpenCanvas={(slug) => canvas.open(slug, 'canvas')}
          onViewCanvasSource={(slug) => canvas.open(slug, 'source')}
        />
        <div className={`assistant-conversation-dock ${stylex.props(styles.dock).className}`}>
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
                  disabled={modelSaving}
                  multiline
                  textareaRef={textareaRef}
                  placeholder="写下问题、判断或行动要求，@ 引用研究资料…"
                  onSubmit={submit}
                  onAbort={() => void abort()}
                  hint={hint}
                  onValueDetail={(value, selectionStart) => syncCursor(value, selectionStart)}
                  inputProps={{
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
                    <Select
                      value={selectedModelValue}
                      options={modelChoices}
                      onChange={onModelChange}
                      className={`assistant-model-select ${stylex.props(styles.modelSelect, modelPickerOpen && styles.modelSelectOpen).className}`}
                      disabled={modelSaving || modelChoices.length === 0}
                      ariaLabel="选择对话模型"
                      placeholder={modelChoices.length === 0 ? '未配置模型' : '选择模型'}
                      onOpenChange={setModelPickerOpen}
                    />
                    <button
                      type="button"
                      className={`assistant-composer-context-action ${stylex.props(styles.contextAction).className}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={openMentionPicker}
                    >
                      <AtSign size={13} aria-hidden="true" /> 引用资料
                    </button>
                  </div>
                  <div
                    className={`assistant-composer-status ${stylex.props(styles.status).className}`}
                  >
                    {modelError ? (
                      <span
                        className={`assistant-model-error ${stylex.props(styles.modelError).className}`}
                        role="alert"
                      >
                        {modelError}
                      </span>
                    ) : null}
                    <span
                      className={`assistant-composer-shortcut ${stylex.props(styles.shortcut).className}`}
                    >
                      <Kbd keys={['enter']} /> 发送 · <Kbd keys={['shift', 'enter']} /> 换行
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CanvasSplit>
  );
}
