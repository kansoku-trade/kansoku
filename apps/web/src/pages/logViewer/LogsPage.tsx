import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, FolderOpen, RefreshCw } from "lucide-react";
import { navigate } from "@web/router";
import { useTitle } from "@web/useTitle";
import { Button, ErrorBox } from "@web/ui";
import { getDesktopLogsBridge } from "./desktopLogs";

const POLL_MS = 2000;
const TAIL_BYTES = 256 * 1024;

export function LogsPage() {
  useTitle("日志");
  const bridge = getDesktopLogsBridge();
  const [path, setPath] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const preRef = useRef<HTMLPreElement | null>(null);
  const stickToBottom = useRef(true);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      const [info, tail] = await Promise.all([bridge.getInfo(), bridge.tail({ maxBytes: TAIL_BYTES })]);
      setPath(info.path);
      setText(tail.text);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    void reload();
    const id = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(id);
  }, [bridge, reload]);

  useEffect(() => {
    if (!autoScroll || !stickToBottom.current) return;
    const el = preRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text, autoScroll]);

  const onScroll = () => {
    const el = preRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stickToBottom.current = nearBottom;
    setAutoScroll(nearBottom);
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const reveal = async () => {
    if (!bridge) return;
    try {
      await bridge.reveal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!bridge) {
    return (
      <div className="page logs-page">
        <LogsBackLink />
        <h1>日志</h1>
        <div className="note-block">日志查看仅在桌面 App 中可用。</div>
      </div>
    );
  }

  return (
    <div className="page logs-page">
      <LogsBackLink />
      <div className="logs-page-header">
        <div>
          <h1>日志</h1>
          <div className="logs-page-path" title={path ?? undefined}>
            {path ?? "加载中…"}
          </div>
        </div>
        <div className="logs-page-actions">
          <Button type="button" onClick={() => void reload()}>
            <RefreshCw size={14} /> 刷新
          </Button>
          <Button type="button" onClick={() => void copyAll()}>
            <Copy size={14} /> {copied ? "已复制" : "复制"}
          </Button>
          <Button type="button" onClick={() => void reveal()}>
            <FolderOpen size={14} /> 在访达中显示
          </Button>
        </div>
      </div>

      {error ? <ErrorBox className="logs-page-error">{error}</ErrorBox> : null}

      <div className="logs-page-meta">
        显示最近约 {Math.round(TAIL_BYTES / 1024)} KB · 每 {POLL_MS / 1000} 秒自动刷新
        {autoScroll ? " · 跟随最新" : " · 已暂停跟随（滚到底部恢复）"}
      </div>

      <pre ref={preRef} className="logs-viewer" onScroll={onScroll}>
        {text || "（暂无日志）"}
      </pre>
    </div>
  );
}

function LogsBackLink() {
  return (
    <a
      className="settings-back-link"
      href="/"
      onClick={(event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (window.history.length > 1) window.history.back();
        else navigate("/");
      }}
    >
      <ArrowLeft className="icon" size={13} /> 返回
    </a>
  );
}
