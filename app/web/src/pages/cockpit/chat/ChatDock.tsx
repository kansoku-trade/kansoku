import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChatComposer } from "./ChatComposer";
import { ChatPanel } from "./ChatPanel";
import { useChatSession } from "./useChatSession";
import { useFloatingRect } from "./useFloatingRect";

export type ChatMode = "dock" | "float" | "full";

interface ChatDockProps {
  chartId: string;
  docCreatedAt: string;
}

export function ChatDock({ chartId, docCreatedAt }: ChatDockProps) {
  const { session, rows, busy, aborting, streamText, liveTools, hint, loaded, suggestions, send, abort, ensureSuggestions } =
    useChatSession(chartId);
  const [mode, setMode] = useState<ChatMode>("dock");
  const [text, setText] = useState("");
  const { rect, onDragStart, onResizeStart, dragging } = useFloatingRect();
  const hostRef = useRef<HTMLDivElement>(null);
  const [layoutEl, setLayoutEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setLayoutEl(hostRef.current?.closest(".layout") ?? null);
  }, []);

  useEffect(() => {
    setMode("dock");
    setText("");
  }, [chartId]);

  useEffect(() => {
    if (busy) setMode((prev) => (prev === "dock" ? "float" : prev));
  }, [busy]);

  useEffect(() => {
    if (mode !== "dock" && loaded && !session) ensureSuggestions();
  }, [mode, loaded, session, ensureSuggestions]);

  useEffect(() => {
    if (mode !== "full") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("float");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setText("");
    setMode((prev) => (prev === "dock" ? "float" : prev));
    const result = await send(trimmed);
    if (!result.ok) setText(trimmed);
  };

  const composer = (
    <ChatComposer
      value={text}
      onChange={setText}
      busy={busy}
      aborting={aborting}
      placeholder="就这份分析继续追问…"
      onSubmit={(value) => void submit(value)}
      onAbort={() => void abort()}
      hint={hint}
      inputProps={{
        autoFocus: mode !== "dock",
        onFocus: () => setMode((prev) => (prev === "dock" ? "float" : prev)),
      }}
    />
  );

  const shell = (
    <motion.div
      className={`chat-shell chat-shell--${mode}${dragging ? " dragging" : ""}`}
      style={mode === "float" ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
      role="dialog"
      aria-label="追问面板"
    >
      {mode === "float" && (
        <>
          <div className="chat-resize chat-resize--w" onPointerDown={onResizeStart("w")} />
          <div className="chat-resize chat-resize--n" onPointerDown={onResizeStart("n")} />
          <div className="chat-resize chat-resize--nw" onPointerDown={onResizeStart("nw")} />
        </>
      )}
      <ChatPanel
        session={session}
        docCreatedAt={docCreatedAt}
        rows={rows}
        busy={busy}
        streamText={streamText}
        liveTools={liveTools}
        suggestions={suggestions}
        mode={mode}
        onDragStart={mode === "float" ? onDragStart : undefined}
        onModeChange={setMode}
        onPickSuggestion={(question) => void submit(question)}
      />
      {composer}
    </motion.div>
  );

  return (
    <div className="chat-dock" ref={hostRef}>
      {mode === "dock" && composer}
      {layoutEl &&
        createPortal(
          <AnimatePresence>{mode !== "dock" && shell}</AnimatePresence>,
          layoutEl,
        )}
    </div>
  );
}
