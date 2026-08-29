import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '../../../theme/tokens.stylex';
import { CanvasSplit } from '../../canvas/CanvasSplit';
import { useCanvasWorkspace } from '../../canvas/useCanvasWorkspace';
import { ChatComposer } from './ChatComposer';
import { ChatPanel } from './ChatPanel';
import { useChatSession } from './useChatSession';
import { useFloatingRect } from './useFloatingRect';

const styles = stylex.create({
  dock: {
    'display': 'flex',
    'flex': '0 0 auto',
    'flexDirection': 'column',
    'borderTopColor': colors.border,
    'borderTopStyle': 'solid',
    'borderTopWidth': '1px',
    'backgroundColor': colors.backgroundSurface,
    ':empty': {
      display: 'none',
    },
  },
  shell: {
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.lg,
  },
  shellFloat: {
    position: 'fixed',
    boxShadow: '0 12px 40px rgb(0 0 0 / 0.6)',
  },
  shellFull: {
    position: 'absolute',
    inset: 0,
    borderStyle: 'none',
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: colors.backgroundCanvas,
  },
  shellDragging: {
    userSelect: 'none',
  },
  resize: {
    position: 'absolute',
    zIndex: 1,
  },
  resizeW: {
    left: '-3px',
    top: 0,
    bottom: 0,
    width: '7px',
    cursor: 'ew-resize',
  },
  resizeN: {
    left: 0,
    right: 0,
    top: '-3px',
    height: '7px',
    cursor: 'ns-resize',
  },
  resizeNW: {
    left: '-3px',
    top: '-3px',
    width: '12px',
    height: '12px',
    cursor: 'nwse-resize',
    zIndex: 2,
  },
});

export type ChatMode = 'dock' | 'float' | 'full';

interface ChatDockProps {
  chartId: string;
  docCreatedAt: string;
}

export function ChatDock({ chartId, docCreatedAt }: ChatDockProps) {
  const {
    session,
    rows,
    busy,
    aborting,
    streamText,
    liveTools,
    hint,
    loaded,
    suggestions,
    send,
    abort,
    ensureSuggestions,
  } = useChatSession(chartId);
  const [mode, setMode] = useState<ChatMode>('dock');
  const canvas = useCanvasWorkspace();
  const [text, setText] = useState('');
  const { rect, onDragStart, onResizeStart, dragging } = useFloatingRect();
  const hostRef = useRef<HTMLDivElement>(null);
  const [layoutEl, setLayoutEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setLayoutEl(hostRef.current?.closest('.layout') ?? null);
  }, []);

  useEffect(() => {
    setMode('dock');
    setText('');
  }, [chartId]);

  useEffect(() => {
    if (busy) setMode((prev) => (prev === 'dock' ? 'float' : prev));
  }, [busy]);

  useEffect(() => {
    if (mode !== 'dock' && loaded && !session) ensureSuggestions();
  }, [mode, loaded, session, ensureSuggestions]);

  useEffect(() => {
    if (mode !== 'full') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('float');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setText('');
    setMode((prev) => (prev === 'dock' ? 'float' : prev));
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
        autoFocus: mode !== 'dock',
        onFocus: () => setMode((prev) => (prev === 'dock' ? 'float' : prev)),
      }}
    />
  );

  const shell = (
    <motion.div
      className={`chat-shell chat-shell--${mode}${dragging ? ' dragging' : ''} ${stylex.props(styles.shell, mode === 'float' && styles.shellFloat, mode === 'full' && styles.shellFull, dragging && styles.shellDragging).className}`}
      style={
        mode === 'float' ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined
      }
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
      role="dialog"
      aria-label="追问面板"
    >
      {mode === 'float' && (
        <>
          <div
            className={`chat-resize chat-resize--w ${stylex.props(styles.resize, styles.resizeW).className}`}
            onPointerDown={onResizeStart('w')}
          />
          <div
            className={`chat-resize chat-resize--n ${stylex.props(styles.resize, styles.resizeN).className}`}
            onPointerDown={onResizeStart('n')}
          />
          <div
            className={`chat-resize chat-resize--nw ${stylex.props(styles.resize, styles.resizeNW).className}`}
            onPointerDown={onResizeStart('nw')}
          />
        </>
      )}
      <CanvasSplit
        openSlug={mode === 'full' ? canvas.openSlug : null}
        view={canvas.view}
        onClose={canvas.close}
        onViewChange={canvas.setView}
        storageKey="canvas-chatdock-pane"
      >
        <ChatPanel
          session={session}
          docCreatedAt={docCreatedAt}
          rows={rows}
          busy={busy}
          streamText={streamText}
          liveTools={liveTools}
          suggestions={suggestions}
          mode={mode}
          onDragStart={mode === 'float' ? onDragStart : undefined}
          onModeChange={setMode}
          onPickSuggestion={(question) => void submit(question)}
          onOpenCanvas={(slug) => {
            canvas.open(slug, 'canvas');
            setMode('full');
          }}
          onViewCanvasSource={(slug) => {
            canvas.open(slug, 'source');
            setMode('full');
          }}
        />
      </CanvasSplit>
      {composer}
    </motion.div>
  );

  return (
    <div className={`chat-dock ${stylex.props(styles.dock).className}`} ref={hostRef}>
      {mode === 'dock' && composer}
      {layoutEl &&
        createPortal(<AnimatePresence>{mode !== 'dock' && shell}</AnimatePresence>, layoutEl)}
    </div>
  );
}
