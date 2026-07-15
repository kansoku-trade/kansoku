import { AtSign } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { ChatComposer } from "../cockpit/chat/ChatComposer";
import { ConversationTranscript } from "../cockpit/chat/ConversationTranscript";
import { useAssistantChatSession } from "../cockpit/chat/useChatSession";
import type { MentionCandidate, MentionTrigger } from "./atMention.js";
import {
  detectMentionTrigger,
  filterMentionCandidates,
  findMentionedCandidates,
  insertMention,
  removeMention,
} from "./atMention.js";
import { AtMentionPopover } from "./AtMentionPopover";
import { ComposerReferences } from "./ComposerReferences";
import { MessageQueueList } from "./MessageQueueList";
import { UsageStatusBar } from "./UsageStatusBar";
import { decideSubmitAction } from "./messageQueue.js";
import { useMessageQueue } from "./useMessageQueue.js";

interface MentionState {
  trigger: MentionTrigger;
  activeIndex: number;
}

export function AssistantConversation({
  sessionId,
  refreshSessions,
  chatModelName,
  mentionCandidates,
}: {
  sessionId: string;
  refreshSessions: () => void;
  chatModelName: string | null;
  mentionCandidates: MentionCandidate[];
}) {
  const { session, rows, busy, aborting, streamText, liveTools, hint, usage, send, abort } = useAssistantChatSession(sessionId);
  const [text, setText] = useState("");
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const wasBusyRef = useRef(busy);
  const cursorRef = useRef(text.length);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const composerExpanded =
    composerFocused || busy || text.trim().length > 0 || queue.queue.length > 0 || mentionedCandidates.length > 0 || Boolean(hint);

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
        <div className="assistant-conversation-head-inner">
          <div className="assistant-conversation-heading">
            <span className="assistant-conversation-eyebrow">研究对话</span>
            <span className="assistant-conversation-title">{session?.title ?? "新的会话"}</span>
          </div>
          <span className={`assistant-conversation-state${busy ? " is-busy" : ""}`}>
            <span className="assistant-conversation-state-dot" />
            {aborting ? "正在停止" : busy ? "正在生成" : "已连接"}
          </span>
        </div>
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
      />
      <div className="assistant-conversation-dock">
        <div className="assistant-conversation-dock-inner">
          <MessageQueueList queue={queue.queue} onRemove={queue.remove} />
          <div className="assistant-conversation-composer" data-expanded={composerExpanded ? "" : undefined}>
            <AnimatePresence initial={false}>
              {mentionState ? (
                <motion.div
                  key="mention-popover"
                  className="assistant-mention-layer"
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.15, ease: "easeIn" } }}
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                >
                  <AtMentionPopover candidates={filteredMentions} activeIndex={mentionState.activeIndex} onPick={pickMention} />
                </motion.div>
              ) : null}
            </AnimatePresence>
            <ComposerReferences references={mentionedCandidates} onRemove={removeReference} />
            <ChatComposer
              value={text}
              onChange={setText}
              busy={busy}
              aborting={aborting}
              allowInputWhileBusy
              multiline
              textareaRef={textareaRef}
              placeholder="写下问题、判断或行动要求，@ 引用研究资料…"
              onSubmit={submit}
              onAbort={() => void abort()}
              hint={hint}
              onValueDetail={(value, selectionStart) => syncCursor(value, selectionStart)}
              inputProps={{
                onFocus: () => setComposerFocused(true),
                onBlur: () => setComposerFocused(false),
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
            <div className="assistant-conversation-composer-meta">
              <button
                type="button"
                className="assistant-composer-context-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={openMentionPicker}
              >
                <AtSign size={13} /> 引用资料
              </button>
              <div className="assistant-composer-status">
                <UsageStatusBar modelName={chatModelName} usage={usage} />
                <span className="assistant-composer-shortcut">
                  <kbd>Enter</kbd> 发送 · <kbd>Shift Enter</kbd> 换行
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
