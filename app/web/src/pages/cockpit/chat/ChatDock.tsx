import { useEffect, useState } from "react";
import { Button, Input, Spinner } from "../../../ui";
import { ChatPanel } from "./ChatPanel";
import { useChatSession } from "./useChatSession";

interface ChatDockProps {
  chartId: string;
  docCreatedAt: string;
}

export function ChatDock({ chartId, docCreatedAt }: ChatDockProps) {
  const { session, rows, busy, streamText, liveTools, hint, send } = useChatSession(chartId);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    setExpanded(false);
    setText("");
  }, [chartId]);

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    const hadSession = Boolean(session);
    setText("");
    const result = await send(value);
    if (!result.ok) {
      setText(value);
      return;
    }
    if (!hadSession) setExpanded(true);
  };

  return (
    <div className="chat-dock">
      {expanded && (
        <ChatPanel
          session={session}
          docCreatedAt={docCreatedAt}
          rows={rows}
          busy={busy}
          streamText={streamText}
          liveTools={liveTools}
          onCollapse={() => setExpanded(false)}
        />
      )}
      <div className="chat-dock-input">
        <Input
          className="chat-dock-field"
          placeholder="就这份分析继续追问…"
          value={text}
          disabled={busy}
          onFocus={() => {
            if (session) setExpanded(true);
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void submit();
          }}
        />
        {busy ? (
          <Spinner />
        ) : (
          <Button className="chat-dock-send" onClick={() => void submit()} disabled={!text.trim()}>
            发送
          </Button>
        )}
      </div>
      {hint && <div className="chat-dock-hint">{hint}</div>}
    </div>
  );
}
