import { useCallback, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatMarketDateTime } from "../../../../shared/time";
import { Button, Empty, ErrorBox, Spinner } from "../../ui";
import { bareSymbol, useDeepDive } from "./useDeepDive";
import { useNote } from "./useNote";

const MARKDOWN_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="note-md-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

function elapsedLabel(startedAt: string | null): string {
  if (!startedAt) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export function NoteTab({ symbol }: { symbol: string }) {
  const { note, error, reload } = useNote(symbol);
  const onNoteReady = useCallback(() => reload(), [reload]);
  const deepDive = useDeepDive(symbol, onNoteReady);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!deepDive.running) return;
    const timer = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [deepDive.running]);

  const confirmAndStart = () => {
    const confirmed = window.confirm(
      "深度分析会跑数分钟，并消耗一次 AI 额度，确定要开始吗？",
    );
    if (confirmed) void deepDive.start();
  };

  if (error) return <ErrorBox>{error}</ErrorBox>;

  const runningElsewhere =
    deepDive.running && deepDive.runningSymbol && bareSymbol(deepDive.runningSymbol) !== bareSymbol(symbol);

  const buttonLabel = deepDive.running
    ? runningElsewhere
      ? `有分析进行中（${deepDive.runningSymbol}）`
      : `分析中…${elapsedLabel(deepDive.startedAt)}`
    : note?.markdown
      ? "重新深度分析"
      : "跑一次深度分析";

  const button = (
    <Button onClick={confirmAndStart} disabled={deepDive.pending || deepDive.running || deepDive.disabled}>
      {(deepDive.pending || deepDive.running) && <Spinner />}
      {buttonLabel}
    </Button>
  );

  return (
    <div className="note-tab">
      {note?.markdown ? (
        <>
          <div className="note-tab-header">
            <span className="note-tab-mtime">更新于 {note.mtime ? formatMarketDateTime(note.mtime) : "—"}</span>
            {button}
          </div>
          {deepDive.inlineMessage && <span className="ai-hint">{deepDive.inlineMessage}</span>}
          {deepDive.successNote && <span className="ai-hint">{deepDive.successNote}</span>}
          <div className="note-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {note.markdown}
            </ReactMarkdown>
          </div>
        </>
      ) : (
        <>
          <Empty>还没有 {symbol} 的研究笔记</Empty>
          <div className="note-tab-header note-tab-header--center">
            {button}
          </div>
          {deepDive.inlineMessage && <span className="ai-hint">{deepDive.inlineMessage}</span>}
          {deepDive.successNote && <span className="ai-hint">{deepDive.successNote}</span>}
        </>
      )}
    </div>
  );
}
