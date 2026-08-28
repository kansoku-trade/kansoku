import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Check, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@web/ui';
import { CanvasCard } from '../../canvas/CanvasCard';
import { canvasEntryFromTool, isLastSaveForSlug } from '../../canvas/canvasEntries';
import { Markdown } from '../markdown';
import { mergeTimeline, type TranscriptInsert } from './transcriptTimeline.js';
import { presentToolCall, toolRowKey } from './toolSummary.js';
import type { ChatLiveTool, ChatRow } from './useChatSession';

const SCROLL_STICK_THRESHOLD = 48;
const tokenFormatter = new Intl.NumberFormat('en-US');
const costFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function ToolRow({
  label,
  running,
  input,
  output,
}: {
  label: string;
  running: boolean;
  input?: string;
  output?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(input || output);
  const presentation = presentToolCall(label, input);
  const hasContext = presentation.items.length > 0 || Boolean(presentation.meta);

  return (
    <div className={`chat-tool${running ? ' chat-tool--running' : ''}`}>
      <button
        type="button"
        className="chat-tool-head"
        onClick={() => setOpen((current) => !current)}
        disabled={!hasDetail}
        aria-expanded={open}
        aria-label={`${presentation.title}，${running ? '进行中' : '已完成'}`}
      >
        <span className={`chat-tool-status${running ? ' running' : ''}`} aria-hidden="true">
          {running ? (
            <span className="chat-tool-status-dot" />
          ) : (
            <Check size={10} strokeWidth={2} />
          )}
        </span>
        <span className="chat-tool-content">
          <span className="chat-tool-title-row">
            <span className="chat-tool-title">{presentation.title}</span>
            <span className="chat-tool-state" aria-live="polite">
              {running ? '进行中' : '已完成'}
            </span>
          </span>
          {hasContext ? (
            <span className="chat-tool-context">
              {presentation.items.map((item, index) => (
                <span className="chat-tool-item" key={`${item}-${index}`}>
                  {item}
                </span>
              ))}
              {presentation.meta ? (
                <span className="chat-tool-meta">{presentation.meta}</span>
              ) : null}
            </span>
          ) : null}
        </span>
        {hasDetail ? (
          <ChevronRight size={12} className={`chat-tool-caret${open ? ' open' : ''}`} />
        ) : null}
      </button>
      {open && hasDetail ? (
        <div className="chat-tool-detail">
          {input ? (
            <div>
              <div className="chat-tool-detail-label">原始请求</div>
              <pre>{input}</pre>
            </div>
          ) : null}
          {output ? (
            <div>
              <div className="chat-tool-detail-label">原始响应</div>
              <pre>{output}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChatRowView({
  row,
  rowIndex,
  rows,
  modelLabels,
  onOpenCanvas,
  onViewCanvasSource,
}: {
  row: ChatRow;
  rowIndex: number;
  rows: ChatRow[];
  modelLabels?: Readonly<Record<string, string>>;
  onOpenCanvas?: (slug: string) => void;
  onViewCanvasSource?: (slug: string) => void;
}) {
  if (row.kind === 'user') {
    return (
      <div className="chat-row chat-row--user">
        <div className="chat-bubble chat-bubble--user">{row.text}</div>
      </div>
    );
  }
  if (row.kind === 'assistant') {
    const meta = row.meta;
    const modelLabel = meta
      ? (modelLabels?.[JSON.stringify([meta.provider, meta.model])] ??
        `${meta.provider}/${meta.model}`)
      : null;
    return (
      <div className="chat-row">
        <div className="chat-assistant-message">
          <div className="chat-bubble chat-bubble--assistant">
            <Markdown variant="chat">{row.text ?? ''}</Markdown>
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
  if (row.kind === 'tool') {
    const entry = canvasEntryFromTool(row.label ?? '', row.input, row.output);
    const showCard =
      entry &&
      onOpenCanvas &&
      onViewCanvasSource &&
      isLastSaveForSlug(rows, rowIndex, entry.slug);
    return (
      <>
        <ToolRow label={row.label ?? ''} running={false} input={row.input} output={row.output} />
        {showCard && entry ? (
          <CanvasCard
            slug={entry.slug}
            title={entry.title}
            onOpen={() => onOpenCanvas(entry.slug)}
            onSource={() => onViewCanvasSource(entry.slug)}
          />
        ) : null}
      </>
    );
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
  onOpenCanvas,
  onViewCanvasSource,
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
  onOpenCanvas?: (slug: string) => void;
  onViewCanvasSource?: (slug: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [stuck, setStuck] = useState(true);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element || !stickRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [rows, inserts, streamText, liveTools]);

  const timeline = useMemo(() => mergeTimeline(rows, inserts), [rows, inserts]);

  const isEmpty =
    rows.length === 0 && inserts.length === 0 && liveTools.length === 0 && !streamText;

  return (
    <ScrollArea
      className={className}
      viewportClassName="chat-transcript-viewport"
      contentClassName="chat-panel-body-content"
      viewportRef={bodyRef}
      onScroll={() => {
        const element = bodyRef.current;
        if (!element) return;
        const next =
          element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_STICK_THRESHOLD;
        stickRef.current = next;
        setStuck(next);
      }}
    >
      {isEmpty && !busy ? (
        <div className="chat-empty">
          <div className="chat-empty-text">{emptyText}</div>
          {suggestions.length > 0 ? (
            <div className="chat-suggestions">
              {suggestions.map((question) => (
                <button
                  type="button"
                  key={question}
                  className="chat-suggestion"
                  onClick={() => onPickSuggestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {timeline.map((entry) =>
        entry.kind === 'row' ? (
          <ChatRowView
            key={entry.row.id}
            row={entry.row}
            rowIndex={rows.indexOf(entry.row)}
            rows={rows}
            modelLabels={modelLabels}
            onOpenCanvas={onOpenCanvas}
            onViewCanvasSource={onViewCanvasSource}
          />
        ) : (
          <div key={entry.insert.id} className="chat-insert">
            {entry.insert.node}
          </div>
        ),
      )}
      {liveTools.map((tool) => (
        <ToolRow
          key={toolRowKey('live', tool.id)}
          label={tool.label}
          running={tool.status === 'start'}
          input={tool.input}
          output={tool.output}
        />
      ))}
      {streamText ? (
        <div className="chat-row">
          <div className="chat-bubble chat-bubble--assistant">
            <Markdown variant="chat" streaming>
              {streamText}
            </Markdown>
          </div>
        </div>
      ) : null}
      {busy && !streamText && !liveTools.some((tool) => tool.status === 'start') ? (
        <div className="chat-row">
          <div className="chat-bubble chat-bubble--assistant chat-thinking" aria-label="正在思考">
            <span className="chat-thinking-dot" />
            <span className="chat-thinking-dot" />
            <span className="chat-thinking-dot" />
          </div>
        </div>
      ) : null}
      {!stuck && busy ? (
        <button
          type="button"
          className="chat-scroll-bottom"
          aria-label="回到底部"
          onClick={() => {
            const element = bodyRef.current;
            if (!element) return;
            stickRef.current = true;
            setStuck(true);
            element.scrollTop = element.scrollHeight;
          }}
        >
          <ArrowDown size={14} />
        </button>
      ) : null}
    </ScrollArea>
  );
}

export const ConversationTranscript = memo(ConversationTranscriptView);
