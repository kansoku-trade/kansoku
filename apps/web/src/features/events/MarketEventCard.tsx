import { useId } from 'react';
import type { EventCanvasPhase } from '@kansoku/core/contract/events';
import type { MarketEvent } from '@kansoku/shared/types';
import { MarketTime } from '@web/ui';
import {
  EVENT_CLASS_LABEL,
  EVENT_SEVERITY_LABEL,
  EVENT_TRUST_LABEL,
  eventSourceLabel,
  shortSymbol,
} from './eventLabels';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * How far behind the world our collector was. Null when we saw the event at or
 * before its own timestamp, which is the normal case for scheduled calendar rows.
 */
export function formatObservedDelay(occurredAt: string, observedAt: string): string | null {
  const occurred = Date.parse(occurredAt);
  const observed = Date.parse(observedAt);
  if (Number.isNaN(occurred) || Number.isNaN(observed)) return null;
  const delta = observed - occurred;
  if (delta <= 0) return null;
  if (delta < MINUTE_MS) return `${Math.round(delta / 1000)} 秒`;
  if (delta < HOUR_MS) return `${Math.round(delta / MINUTE_MS)} 分钟`;
  if (delta < DAY_MS) return `${trimmed(delta / HOUR_MS)} 小时`;
  return `${trimmed(delta / DAY_MS)} 天`;
}

export type EventCanvasAction = 'generate' | 'open' | 'running' | 'retry';

export function eventCanvasAction(
  event: MarketEvent,
  phase?: EventCanvasPhase | null,
): EventCanvasAction {
  if (phase === 'queued' || phase === 'running') return 'running';
  if (phase === 'failed') return 'retry';
  if (event.canvasSlug) return 'open';
  return 'generate';
}

const CANVAS_LABEL: Record<EventCanvasAction, string> = {
  generate: '生成画布',
  open: '打开画布',
  running: '生成中…',
  retry: '重试生成',
};

const CANVAS_ARIA: Record<EventCanvasAction, (title: string) => string> = {
  generate: (title) => `生成事件画布：${title}`,
  open: (title) => `打开事件画布：${title}`,
  running: (title) => `正在生成事件画布：${title}`,
  retry: (title) => `重试生成事件画布：${title}`,
};

export interface MarketEventCardProps {
  event: MarketEvent;
  canvasPhase?: EventCanvasPhase | null;
  // Task 4 owns the generation run; the card only reports the intent. Without a
  // handler the control stays on screen but inert, so the row does not reflow
  // once generation is wired up.
  onGenerateCanvas?: (event: MarketEvent) => void;
  onOpenCanvas?: (slug: string) => void;
}

export function MarketEventCard({
  event,
  canvasPhase,
  onGenerateCanvas,
  onOpenCanvas,
}: MarketEventCardProps) {
  const titleId = useId();
  const { payload } = event;
  const delay = formatObservedDelay(event.occurredAt, event.observedAt);
  const action = eventCanvasAction(event, canvasPhase);

  return (
    <article className={`evt-row evt-row--${event.severity}`} aria-labelledby={titleId}>
      <div className="evt-row-gutter">
        <span className="evt-row-time num">
          <MarketTime value={event.occurredAt} format="month-day-time" zone="market" />
        </span>
        <span className={`evt-sev evt-sev--${event.severity}`}>
          {EVENT_SEVERITY_LABEL[event.severity]}
        </span>
      </div>
      <div className="evt-row-body">
        <div className="evt-row-meta">
          <span className="evt-tag evt-tag--source">{eventSourceLabel(event.source)}</span>
          <span className={`evt-tag evt-trust evt-trust--${event.trust}`}>
            {EVENT_TRUST_LABEL[event.trust]}
          </span>
          <span className="evt-tag evt-tag--class">{EVENT_CLASS_LABEL[event.class]}</span>
          <span className="evt-row-observed num">
            观察 <MarketTime value={event.observedAt} format="clock" zone="market" />
            {delay ? ` · 慢 ${delay}` : ' · 即时'}
          </span>
        </div>
        <h4 className="evt-row-title" id={titleId}>
          {payload.title}
        </h4>
        {payload.summary && <p className="evt-row-summary">{payload.summary}</p>}
        <div className="evt-row-foot">
          <span className="evt-row-syms">
            {event.symbols.map((symbol) => (
              <a
                className="evt-row-sym num"
                key={symbol}
                href={`/symbol/${encodeURIComponent(symbol)}`}
              >
                {shortSymbol(symbol)}
              </a>
            ))}
          </span>
          <span className="evt-row-actions">
            {payload.url && (
              <a
                aria-label={`打开原文：${payload.title}`}
                className="evt-row-action"
                href={payload.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                原文
              </a>
            )}
            <button
              aria-label={CANVAS_ARIA[action](payload.title)}
              className="evt-row-action evt-row-action--canvas"
              disabled={
                action === 'running' ||
                (action === 'open' ? !onOpenCanvas && !onGenerateCanvas : !onGenerateCanvas)
              }
              onClick={() => {
                if (action === 'open' && event.canvasSlug && onOpenCanvas) {
                  onOpenCanvas(event.canvasSlug);
                  return;
                }
                onGenerateCanvas?.(event);
              }}
              type="button"
            >
              {CANVAS_LABEL[action]}
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}
