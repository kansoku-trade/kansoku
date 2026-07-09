import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { MarketTime } from "../../../ui";
import { Markdown } from "../markdown";
import type { ChatLiveTool, ChatRow, ChatSessionInfo } from "./useChatSession";

const SCROLL_STICK_THRESHOLD = 48;

interface ChatPanelProps {
  session: ChatSessionInfo | null;
  docCreatedAt: string;
  rows: ChatRow[];
  busy: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  onCollapse: () => void;
}

function ChatRowView({ row }: { row: ChatRow }) {
  if (row.kind === "user") {
    return (
      <div className="chat-row chat-row--user">
        <div className="chat-bubble chat-bubble--user">{row.text}</div>
      </div>
    );
  }
  if (row.kind === "assistant") {
    return (
      <div className="chat-row">
        <div className="chat-bubble chat-bubble--assistant">
          <Markdown>{row.text ?? ""}</Markdown>
        </div>
      </div>
    );
  }
  if (row.kind === "tool") {
    return <div className="chat-tool-row">已调用 {row.label}</div>;
  }
  return <div className="chat-error-row">{row.text}</div>;
}

export function ChatPanel({ session, docCreatedAt, rows, busy, streamText, liveTools, onCollapse }: ChatPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rows, streamText, liveTools]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_STICK_THRESHOLD;
  };

  const isEmpty = rows.length === 0 && liveTools.length === 0 && !streamText;

  return (
    <div className="chat-panel">
      <div className="chat-panel-head">
        <span className="chat-panel-title">{session?.title ?? "新的追问"}</span>
        <span className="chat-panel-subtitle">
          关于 <MarketTime value={docCreatedAt} format="clock" /> 的分析
        </span>
        <button className="chat-panel-collapse" onClick={onCollapse} aria-label="收起">
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="chat-panel-body" ref={bodyRef} onScroll={onScroll}>
        {isEmpty && !busy && <div className="chat-empty">还没有对话，在下方输入你的问题</div>}
        {rows.map((row) => (
          <ChatRowView key={row.id} row={row} />
        ))}
        {liveTools.map((tool) => (
          <div key={tool.id} className="chat-tool-row">
            正在{tool.label}…
          </div>
        ))}
        {streamText && (
          <div className="chat-row">
            <div className="chat-bubble chat-bubble--assistant">
              <Markdown>{streamText}</Markdown>
              <span className="chat-cursor" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
