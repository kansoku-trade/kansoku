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
}

type GuestMessage =
  | { type: 'ready' }
  | { type: 'ok' }
  | { type: 'height'; height: number }
  | { type: 'runtime-error'; issues?: string[]; stage?: 'compile' | 'runtime' };

const INITIAL_HEIGHT = 320;

export function CanvasFrame({ source, slug }: CanvasFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const [height, setHeight] = useState(INITIAL_HEIGHT);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const postSource = () => {
      frame.contentWindow?.postMessage({ type: 'source', source: sourceRef.current }, '*');
    };

    const onMessage = (event: MessageEvent<GuestMessage>) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'ready') {
        postSource();
        return;
      }
      if (data.type === 'height') {
        if (data.height > 0) setHeight(data.height);
        return;
      }
      if (data.type !== 'ok' && data.type !== 'runtime-error') return;
      if (!slug) return;
      const issues = data.type === 'ok' ? [] : (data.issues ?? ['canvas failed']);
      const stage = data.type === 'ok' ? 'compile' : (data.stage ?? 'runtime');
      void client.canvas.recordCheck({ slug, issues, stage });
    };

    frame.addEventListener('load', postSource);
    window.addEventListener('message', onMessage);
    return () => {
      frame.removeEventListener('load', postSource);
      window.removeEventListener('message', onMessage);
    };
  }, [slug, source]);

  return (
    <ScrollArea className={stylex.props(styles.root).className}>
      <div {...stylex.props(styles.pad)}>
        <iframe
          {...stylex.props(styles.frame)}
          style={{ height }}
          ref={frameRef}
          title="canvas"
          scrolling="no"
          src="/canvas-guest.html"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </ScrollArea>
  );
}
