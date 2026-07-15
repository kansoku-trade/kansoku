import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { ChatComposer } from "../cockpit/chat/ChatComposer";
import { ConversationTranscript } from "../cockpit/chat/ConversationTranscript";
import { useAssistantChatSession } from "../cockpit/chat/useChatSession";
import type { MentionCandidate, MentionTrigger } from "./atMention.js";
import { detectMentionTrigger, filterMentionCandidates, insertMention } from "./atMention.js";
import { AtMentionPopover } from "./AtMentionPopover";
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
  const wasBusyRef = useRef(busy);
  const cursorRef = useRef(text.length);

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

  const syncCursorFromEvent = (event: SyntheticEvent<HTMLInputElement>) => {
    syncCursor(event.currentTarget.value, event.currentTarget.selectionStart);
  };

  const pickMention = (candidate: MentionCandidate) => {
    if (!mentionState) return;
    const result = insertMention(text, cursorRef.current, mentionState.trigger, candidate.path);
    setText(result.text);
    cursorRef.current = result.cursor;
    setMentionState(null);
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
        emptyText="还没有对话，在下方输入你的问题"
        onPickSuggestion={() => {}}
      />
      <UsageStatusBar modelName={chatModelName} usage={usage} />
      <MessageQueueList queue={queue.queue} onRemove={queue.remove} />
      <div className="assistant-conversation-composer">
        {mentionState ? (
          <AtMentionPopover candidates={filteredMentions} activeIndex={mentionState.activeIndex} onPick={pickMention} />
        ) : null}
        <ChatComposer
          value={text}
          onChange={setText}
          busy={busy}
          aborting={aborting}
          allowInputWhileBusy
          placeholder="输入消息，@ 引用文件…"
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
              setMentionState((current) => (current ? { ...current, activeIndex: Math.max(current.activeIndex - 1, 0) } : current));
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
      </div>
    </div>
  );
}
