import { useEffect, useRef, useState } from 'react';
import type { CandleFeed, QuoteSnapshot } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { client } from '@web/lib/client';
import { ScrollArea } from '@web/ui';
import { subscribeChannel } from '@web/lib/ws/wsHub';
import { colors } from '../../theme/tokens.stylex';
import { decodePreviewEnvelope } from '../charts/intraday/useIntradayPreview';

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

export interface CanvasLiveStatus {
  subscribed: boolean;
  connected: boolean;
  degraded: boolean;
}

export interface CanvasFrameProps {
  source: string;
  slug?: string;
  data?: Record<string, unknown>;
  onLiveStatus?: (status: CanvasLiveStatus) => void;
}

type FeedKind = 'quotes' | 'preview';

type GuestMessage =
  | { type: 'ready' }
  | { type: 'ok' }
  | { type: 'height'; height: number }
  | { type: 'runtime-error'; issues?: string[]; stage?: 'compile' | 'runtime' }
  | { type: 'sub' | 'unsub'; kind: FeedKind; symbol: string };

const INITIAL_HEIGHT = 320;

export function CanvasFrame({ source, slug, data, onLiveStatus }: CanvasFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const dataRef = useRef(data);
  dataRef.current = data;
  const readyRef = useRef(false);
  const subsRef = useRef(new Map<string, () => void>());
  const statusRef = useRef<CanvasLiveStatus>({
    subscribed: false,
    connected: false,
    degraded: false,
  });
  const onLiveStatusRef = useRef(onLiveStatus);
  onLiveStatusRef.current = onLiveStatus;
  const [height, setHeight] = useState(INITIAL_HEIGHT);

  useEffect(
    () => () => {
      for (const release of subsRef.current.values()) release();
      subsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const postSource = () => {
      frame.contentWindow?.postMessage(
        { type: 'source', source: sourceRef.current, data: dataRef.current ?? {} },
        '*',
      );
    };

    const toGuest = (message: unknown) => {
      frame.contentWindow?.postMessage(message, '*');
    };

    const emitStatus = (patch: Partial<CanvasLiveStatus>) => {
      const previous = statusRef.current;
      const next = { ...previous, ...patch, subscribed: subsRef.current.size > 0 };
      if (
        next.subscribed === previous.subscribed &&
        next.connected === previous.connected &&
        next.degraded === previous.degraded
      ) {
        return;
      }
      statusRef.current = next;
      toGuest({ type: 'feed-status', connected: next.connected, degraded: next.degraded });
      onLiveStatusRef.current?.(next);
    };

    const openSub = (kind: FeedKind, symbol: string) => {
      const key = `${kind}:${symbol}`;
      if (subsRef.current.has(key)) return;
      subsRef.current.set(key, () => {});
      const forward = (payload: QuoteSnapshot['quotes'][number] | CandleFeed) => {
        toGuest({ type: 'feed', kind, symbol, data: payload });
      };
      const onConnected = (connected: boolean) => emitStatus({ connected });
      let hadBuilt = false;
      const release =
        kind === 'quotes'
          ? subscribeChannel(
              { kind: 'quotes', extra: [symbol] },
              (payload) => {
                const envelope = payload as {
                  type?: string;
                  data?: QuoteSnapshot;
                  degraded?: boolean;
                };
                if (envelope?.type === 'status') {
                  emitStatus({ degraded: Boolean(envelope.degraded) });
                  return;
                }
                const cell = envelope?.data?.quotes.find((item) => item.symbol === symbol);
                if (cell) forward(cell);
              },
              onConnected,
            )
          : subscribeChannel(
              { kind: 'preview', symbol },
              (payload) => {
                const decoded = decodePreviewEnvelope(payload, hadBuilt);
                if (decoded.degraded !== undefined) emitStatus({ degraded: decoded.degraded });
                if (!decoded.built) return;
                hadBuilt = true;
                forward({
                  symbol,
                  asOf: new Date().toISOString(),
                  timeframes: decoded.built.timeframes,
                });
              },
              onConnected,
            );
      subsRef.current.set(key, release);
      emitStatus({});
    };

    const closeSub = (kind: FeedKind, symbol: string) => {
      const key = `${kind}:${symbol}`;
      const release = subsRef.current.get(key);
      if (!release) return;
      subsRef.current.delete(key);
      release();
      emitStatus({});
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
      if (payload.type === 'sub' || payload.type === 'unsub') {
        if (payload.kind !== 'quotes' && payload.kind !== 'preview') return;
        if (typeof payload.symbol !== 'string' || !payload.symbol) return;
        if (payload.type === 'sub') openSub(payload.kind, payload.symbol);
        else closeSub(payload.kind, payload.symbol);
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
      for (const release of subsRef.current.values()) release();
      subsRef.current.clear();
      emitStatus({});
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
