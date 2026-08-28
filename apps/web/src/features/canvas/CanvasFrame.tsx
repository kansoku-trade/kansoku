import { useEffect, useRef } from 'react';
import { client } from '@web/lib/client';

export interface CanvasFrameProps {
  source: string;
  slug?: string;
}

type GuestMessage =
  | { type: 'ready' }
  | { type: 'ok' }
  | { type: 'runtime-error'; issues?: string[]; stage?: 'compile' | 'runtime' };

export function CanvasFrame({ source, slug }: CanvasFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

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
    <iframe
      ref={frameRef}
      title="canvas"
      src="/canvas-guest.html"
      sandbox="allow-scripts allow-same-origin"
      style={{ width: '100%', height: '100%', border: 0, background: '#0a0a0a' }}
    />
  );
}
