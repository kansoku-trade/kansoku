import { gsap } from "gsap";
import { AtSign } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { Kbd, Select } from "@web/ui";
import { ChatComposer } from "../cockpit/chat/ChatComposer";
import { ConversationTranscript } from "../cockpit/chat/ConversationTranscript";
import { useAssistantChatSession } from "../cockpit/chat/useChatSession";
import type { MentionCandidate, MentionTrigger } from "./atMention.js";
import type { AssistantModelChoice } from "./assistantModels";
import {
  detectMentionTrigger,
  filterMentionCandidates,
  findMentionedCandidates,
  insertMention,
  removeMention,
} from "./atMention.js";
import { AtMentionPopover } from "./AtMentionPopover";
import { shouldExpandComposer } from "./composerExpansion";
import { ComposerReferences } from "./ComposerReferences";
import { MessageQueueList } from "./MessageQueueList";
import { decideSubmitAction } from "./messageQueue.js";
import { useMessageQueue } from "./useMessageQueue.js";

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
  const { session, rows, busy, aborting, streamText, liveTools, hint, send, abort } = useAssistantChatSession(sessionId);
  const [text, setText] = useState("");
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
    if (!trimmed) return { ok: false, error: "内容不能为空" };
    return send(trimmed);
  };

  const queue = useMessageQueue({ busy, onSend: doSend });

  const filteredMentions = mentionState ? filterMentionCandidates(mentionCandidates, mentionState.trigger.query) : [];
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
    const fromHeight = inlineHeight && inlineHeight !== "auto" ? renderedHeight : (previousTarget ?? renderedHeight);

    gsap.killTweensOf(element);
    gsap.set(element, { height: "auto" });
    const targetHeight = element.getBoundingClientRect().height;
    composerTargetHeightRef.current = targetHeight;

    if (previousTarget === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(element, { clearProps: "height,overflow" });
      return;
    }

    gsap.fromTo(
      element,
      { height: fromHeight, overflow: "hidden" },
      {
        height: targetHeight,
        duration: 0.24,
        ease: "power2.out",
        overwrite: true,
        onComplete: () => gsap.set(element, { clearProps: "height,overflow" }),
      },
    );
  }, [composerExpanded]);

  useEffect(() => () => {
    if (composerRef.current) gsap.killTweensOf(composerRef.current);
  }, []);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setText("");
    setMentionState(null);
    if (decideSubmitAction(busy, queue.queue.length) === "enqueue") {
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
      if (current && current.trigger.start === trigger.start) return { trigger, activeIndex: current.activeIndex };
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
    const needsLeadingSpace = cursor > 0 && !/\s/.test(text[cursor - 1] ?? "");
    const inserted = `${needsLeadingSpace ? " " : ""}@`;
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
    <div className="assistant-conversation">
      <div className="assistant-conversation-head">
        <span className="assistant-conversation-title">{session?.title ?? "新的会话"}</span>
      </div>
      <ConversationTranscript
        className="assistant-conversation-body"
        rows={rows}
        busy={busy}
        streamText={streamText}
        liveTools={liveTools}
        suggestions={[]}
        emptyText="输入问题、判断或交易计划，开始一段研究对话"
        onPickSuggestion={() => {}}
        modelLabels={modelLabels}
      />
      <div className="assistant-conversation-dock">
        <div className="assistant-conversation-dock-inner">
          <MessageQueueList queue={queue.queue} onRemove={queue.remove} />
          <div className="assistant-conversation-composer-wrap">
            {mentionState ? (
              <div className="assistant-mention-layer">
                <AtMentionPopover candidates={filteredMentions} activeIndex={mentionState.activeIndex} onPick={pickMention} />
              </div>
            ) : null}
            <div
              ref={composerRef}
              className="assistant-conversation-composer"
              data-expanded={composerExpanded ? "" : undefined}
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
                  if (event.key === "Escape") {
                    setMentionState(null);
                    event.preventDefault();
                    return true;
                  }
                  if (event.key === "ArrowDown") {
                    setMentionState((current) =>
                      current ? { ...current, activeIndex: Math.min(current.activeIndex + 1, filteredMentions.length - 1) } : current,
                    );
                    event.preventDefault();
                    return true;
                  }
                  if (event.key === "ArrowUp") {
                    setMentionState((current) =>
                      current ? { ...current, activeIndex: Math.max(current.activeIndex - 1, 0) } : current,
                    );
                    event.preventDefault();
                    return true;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const candidate = filteredMentions[mentionState.activeIndex];
                    if (candidate) pickMention(candidate);
                    return true;
                  }
                  return false;
                }}
              />
              <div className="assistant-conversation-composer-meta" aria-hidden={!composerExpanded} inert={!composerExpanded}>
                <div className="assistant-composer-tools">
                  <Select
                    value={selectedModelValue}
                    options={modelChoices}
                    onChange={onModelChange}
                    className="assistant-model-select"
                    disabled={modelSaving || modelChoices.length === 0}
                    ariaLabel="选择对话模型"
                    placeholder={modelChoices.length === 0 ? "未配置模型" : "选择模型"}
                    onOpenChange={setModelPickerOpen}
                  />
                  <button
                    type="button"
                    className="assistant-composer-context-action"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={openMentionPicker}
                  >
                    <AtSign size={13} aria-hidden="true" /> 引用资料
                  </button>
                </div>
                <div className="assistant-composer-status">
                  {modelError ? (
                    <span className="assistant-model-error" role="alert">
                      {modelError}
                    </span>
                  ) : null}
                  <span className="assistant-composer-shortcut">
                    <Kbd keys={["enter"]} /> 发送 · <Kbd keys={["shift", "enter"]} /> 换行
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
