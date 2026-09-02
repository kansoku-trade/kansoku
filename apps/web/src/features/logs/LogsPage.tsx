import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ArrowLeft, Copy, FolderOpen, RefreshCw } from 'lucide-react';
import { navigate } from '@web/lib/router';
import { useTitle } from '@web/lib/useTitle';
import { Button, ErrorBox } from '@web/ui';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import { getDesktopLogsBridge } from './desktopLogs';

const POLL_MS = 2000;
const TAIL_BYTES = 256 * 1024;

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 0,
  },
  header: {
    alignItems: 'flex-start',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    margin: 0,
  },
  path: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    marginTop: 4,
    overflowWrap: 'anywhere',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionButton: {
    alignItems: 'center',
    display: 'inline-flex',
    gap: 6,
  },
  backLink: {
    color: {
      'default': colors.textPrimary,
      ':hover': colors.accent,
    },
    textDecoration: 'none',
  },
  error: {
    margin: 0,
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  viewer: {
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderStyle: 'solid',
    borderWidth: 1,
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    lineHeight: 1.55,
    margin: 0,
    maxHeight: 'calc(100vh - 220px)',
    minHeight: 420,
    overflow: 'auto',
    padding: '12px 14px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  icon: {
    verticalAlign: '-2px',
  },
});

const pageClassName = ['page', stylex.props(styles.page).className].filter(Boolean).join(' ');
const actionButtonClassName = stylex.props(styles.actionButton).className;
const errorClassName = stylex.props(styles.error).className;

export function LogsPage() {
  useTitle('日志');

  return (
    <div className={pageClassName}>
      <LogsBackLink />
      <h1 {...stylex.props(styles.title)}>日志</h1>
      <LogsViewer />
    </div>
  );
}

export function LogsViewer() {
  const [bridge] = useState(() => getDesktopLogsBridge());
  const [path, setPath] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const preRef = useRef<HTMLPreElement | null>(null);
  const stickToBottomRef = useRef(true);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      const [info, tail] = await Promise.all([
        bridge.getInfo(),
        bridge.tail({ maxBytes: TAIL_BYTES }),
      ]);
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
    if (!autoScroll || !stickToBottomRef.current) return;
    const preElementRef = preRef.current;
    if (!preElementRef) return;
    preElementRef.scrollTop = preElementRef.scrollHeight;
  }, [text, autoScroll]);

  const onScroll = () => {
    const preElementRef = preRef.current;
    if (!preElementRef) return;
    const nearBottom =
      preElementRef.scrollHeight - preElementRef.scrollTop - preElementRef.clientHeight < 48;
    stickToBottomRef.current = nearBottom;
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
    return <div className="note-block">日志查看仅在桌面 App 中可用。</div>;
  }

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.path)} title={path ?? undefined}>
          {path ?? '加载中…'}
        </div>
        <div {...stylex.props(styles.actions)}>
          <Button className={actionButtonClassName} type="button" onClick={() => void reload()}>
            <RefreshCw size={14} /> 刷新
          </Button>
          <Button className={actionButtonClassName} type="button" onClick={() => void copyAll()}>
            <Copy size={14} /> {copied ? '已复制' : '复制'}
          </Button>
          <Button className={actionButtonClassName} type="button" onClick={() => void reveal()}>
            <FolderOpen size={14} /> 在访达中显示
          </Button>
        </div>
      </div>

      {error ? <ErrorBox className={errorClassName}>{error}</ErrorBox> : null}

      <div {...stylex.props(styles.meta)}>
        显示最近约 {Math.round(TAIL_BYTES / 1024)} KB · 每 {POLL_MS / 1000} 秒自动刷新
        {autoScroll ? ' · 跟随最新' : ' · 已暂停跟随（滚到底部恢复）'}
      </div>

      <pre ref={preRef} {...stylex.props(styles.viewer)} onScroll={onScroll}>
        {text || '（暂无日志）'}
      </pre>
    </div>
  );
}

function LogsBackLink() {
  return (
    <a
      className={`settings-back-link ${stylex.props(styles.backLink).className}`}
      href="/"
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        if (window.history.length > 1) window.history.back();
        else navigate('/');
      }}
    >
      <ArrowLeft className={`icon ${stylex.props(styles.icon).className}`} size={13} /> 返回
    </a>
  );
}
