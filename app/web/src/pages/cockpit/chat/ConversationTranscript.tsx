import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ScrollArea } from "../../../ui";
import { Markdown } from "../markdown";
import { mergeTimeline, type TranscriptInsert } from "./transcriptTimeline.js";
import { summarizeToolInput, toolRowKey } from "./toolSummary.js";
import type { ChatLiveTool, ChatRow } from "./useChatSession";

const SCROLL_STICK_THRESHOLD = 48;
const tokenFormatter = new Intl.NumberFormat("en-US");
const costFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function ToolRow({ label, running, input, output }: { label: string; running: boolean; input?: string; output?: string }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(input || output);
  const summary = summarizeToolInput(input);

  return (
    <div className="chat-tool">
      <button
        type="button"
        className="chat-tool-head"
        onClick={() => setOpen((current) => !current)}
        disabled={!hasDetail}
        aria-expanded={open}
      >
        <span className={`chat-tool-dot${running ? " running" : ""}`} />
        <span>
          {running ? "正在" : "已调用 "}
          {label}
          {running ? "…" : ""}
        </span>
        {summary ? <span className="chat-tool-summary">{summary}</span> : null}
        {hasDetail ? <ChevronRight size={12} className={`chat-tool-caret${open ? " open" : ""}`} /> : null}
      </button>
      {open && hasDetail ? (
        <div className="chat-tool-detail">
          {input ? (
            <div>
              <div className="chat-tool-detail-label">查了什么</div>
              <pre>{input}</pre>
            </div>
          ) : null}
          {output ? (
            <div>
              <div className="chat-tool-detail-label">拿回什么</div>
              <pre>{output}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChatRowView({ row, modelLabels }: { row: ChatRow; modelLabels?: Readonly<Record<string, string>> }) {
  if (row.kind === "user") {
    return (
      <div className="chat-row chat-row--user">
        <div className="chat-bubble chat-bubble--user">{row.text}</div>
      </div>
    );
  }
  if (row.kind === "assistant") {
    const meta = row.meta;
    const modelLabel = meta
      ? (modelLabels?.[JSON.stringify([meta.provider, meta.model])] ?? `${meta.provider}/${meta.model}`)
      : null;
    return (
      <div className="chat-row">
        <div className="chat-assistant-message">
          <div className="chat-bubble chat-bubble--assistant">
            <Markdown variant="chat">{row.text ?? ""}</Markdown>
          </div>
          {meta && modelLabels ? (
            <div className="chat-message-meta">
              <span>{modelLabel}</span>
              <span>{tokenFormatter.format(meta.totalTokens)} tokens</span>
              <span>{costFormatter.format(meta.costTotal)}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  if (row.kind === "tool") {
    return <ToolRow label={row.label ?? ""} running={false} input={row.input} output={row.output} />;
  }
  return <div className="chat-error-row">{row.text}</div>;
}

function ConversationTranscriptView({
  rows,
  inserts = [],
  busy,
  streamText,
  liveTools,
  suggestions,
  emptyText,
  onPickSuggestion,
  className,
  modelLabels,
}: {
  rows: ChatRow[];
  inserts?: TranscriptInsert[];
  busy: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  suggestions: string[];
  emptyText: string;
  onPickSuggestion: (question: string) => void;
  className?: string;
  modelLabels?: Readonly<Record<string, string>>;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element || !stickRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [rows, inserts, streamText, liveTools]);

  const timeline = useMemo(() => mergeTimeline(rows, inserts), [rows, inserts]);

  const isEmpty = rows.length === 0 && inserts.length === 0 && liveTools.length === 0 && !streamText;

  return (
    <ScrollArea
      className={className}
      contentClassName="chat-panel-body-content"
      viewportRef={bodyRef}
      onScroll={() => {
        const element = bodyRef.current;
        if (!element) return;
        stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_STICK_THRESHOLD;
      }}
    >
      {isEmpty && !busy ? (
        <div className="chat-empty">
          <div className="chat-empty-text">{emptyText}</div>
          {suggestions.length > 0 ? (
            <div className="chat-suggestions">
              {suggestions.map((question) => (
                <button type="button" key={question} className="chat-suggestion" onClick={() => onPickSuggestion(question)}>
                  {question}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {timeline.map((entry) =>
        entry.kind === "row" ? (
          <ChatRowView key={entry.row.id} row={entry.row} modelLabels={modelLabels} />
        ) : (
          <div key={entry.insert.id} className="chat-insert">
            {entry.insert.node}
          </div>
        ),
      )}
      {liveTools.map((tool) => (
        <ToolRow
          key={toolRowKey("live", tool.id)}
          label={tool.label}
          running={tool.status === "start"}
          input={tool.input}
          output={tool.output}
        />
      ))}
      {streamText ? (
        <div className="chat-row">
          <div className="chat-bubble chat-bubble--assistant">
            <Markdown variant="chat">{streamText}</Markdown>
            <span className="chat-cursor" />
          </div>
        </div>
      ) : null}
    </ScrollArea>
  );
}

export const ConversationTranscript = memo(ConversationTranscriptView);
