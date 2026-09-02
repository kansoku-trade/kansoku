import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { client } from '@web/lib/client';
import { ScrollArea } from '@web/ui';
import { colors } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundCanvas,
    height: '100%',
  },
  pad: {
    padding: '18px 20px 28px',
  },
  frame: {
    borderStyle: 'none',
    borderWidth: 0,
    display: 'block',
    width: '100%',
  },
});

export interface CanvasFrameProps {
  source: string;
  slug?: string;
  data?: Record<string, unknown>;
}

type GuestMessage =
  | { type: 'ready' }
  | { type: 'ok' }
  | { type: 'height'; height: number }
  | { type: 'runtime-error'; issues?: string[]; stage?: 'compile' | 'runtime' };

const INITIAL_HEIGHT = 320;

export function CanvasFrame({ source, slug, data }: CanvasFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const dataRef = useRef(data);
  dataRef.current = data;
  const readyRef = useRef(false);
  const [height, setHeight] = useState(INITIAL_HEIGHT);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const postSource = () => {
      frame.contentWindow?.postMessage(
        { type: 'source', source: sourceRef.current, data: dataRef.current ?? {} },
        '*',
      );
    };

    const onMessage = (event: MessageEvent<GuestMessage>) => {
      if (event.source !== frame.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'ready') {
        readyRef.current = true;
        postSource();
        return;
      }
      if (payload.type === 'height') {
        if (payload.height > 0) setHeight(payload.height);
        return;
      }
      if (payload.type !== 'ok' && payload.type !== 'runtime-error') return;
      if (!slug) return;
      const issues = payload.type === 'ok' ? [] : (payload.issues ?? ['canvas failed']);
      const stage = payload.type === 'ok' ? 'compile' : (payload.stage ?? 'runtime');
      void client.canvas.recordCheck({ slug, issues, stage });
    };

    const onLoad = () => {
      readyRef.current = false;
      postSource();
    };

    if (readyRef.current) postSource();
    frame.addEventListener('load', onLoad);
    window.addEventListener('message', onMessage);
    return () => {
      frame.removeEventListener('load', onLoad);
      window.removeEventListener('message', onMessage);
    };
  }, [data, slug, source]);

  return (
    <ScrollArea className={stylex.props(styles.root).className}>
      <div {...stylex.props(styles.pad)}>
        <iframe
          {...stylex.props(styles.frame)}
          style={{ height }}
          ref={frameRef}
          title="canvas"
          tabIndex={-1}
          scrolling="no"
          src="/canvas-guest.html"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </ScrollArea>
  );
}
