import { ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { MarketTime } from "@web/ui";
import { ConversationTranscript } from "./ConversationTranscript";
import type { ChatMode } from "./ChatDock";
import type { ChatLiveTool, ChatRow, ChatSessionInfo } from "./useChatSession";

interface ChatPanelProps {
  session: ChatSessionInfo | null;
  docCreatedAt: string;
  rows: ChatRow[];
  busy: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  suggestions: string[];
  mode: ChatMode;
  onDragStart?: (e: React.PointerEvent) => void;
  onModeChange: (mode: ChatMode) => void;
  onPickSuggestion: (question: string) => void;
}

export function ChatPanel({
  session,
  docCreatedAt,
  rows,
  busy,
  streamText,
  liveTools,
  suggestions,
  mode,
  onDragStart,
  onModeChange,
  onPickSuggestion,
}: ChatPanelProps) {
  return (
    <div className="chat-panel">
      <div className={`chat-panel-head${onDragStart ? " draggable" : ""}`} onPointerDown={onDragStart}>
        <span className="chat-panel-title">{session?.title ?? "新的追问"}</span>
        <span className="chat-panel-subtitle">
          关于 <MarketTime value={docCreatedAt} format="clock" /> 的分析
        </span>
        <div className="chat-panel-actions">
          <button
            onClick={() => onModeChange(mode === "full" ? "float" : "full")}
            aria-label={mode === "full" ? "退出全屏" : "全屏"}
            title={mode === "full" ? "退出全屏（Esc）" : "全屏"}
          >
            {mode === "full" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button onClick={() => onModeChange("dock")} aria-label="收起">
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <ConversationTranscript
        className="chat-panel-body"
        rows={rows}
        busy={busy}
        streamText={streamText}
        liveTools={liveTools}
        suggestions={suggestions}
        emptyText="还没有对话，在下方输入你的问题"
        onPickSuggestion={onPickSuggestion}
      />
    </div>
  );
}
