import { useId } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { EventCanvasPhase } from '@kansoku/core/contract/events';
import type { MarketEvent } from '@kansoku/shared/types';
import { MarketTime } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
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

const styles = stylex.create({
  row: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.borderStrong,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    display: 'grid',
    gap: '8px',
    gridTemplateColumns: '72px minmax(0, 1fr)',
    padding: '7px 8px 8px',
  },
  rowCritical: {
    borderLeftColor: colors.down,
  },
  rowNotable: {
    borderLeftColor: colors.accent,
  },
  gutter: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  time: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 1.3,
  },
  severity: {
    color: colors.textMuted,
    fontSize: '9px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  severityCritical: {
    color: colors.down,
  },
  severityNotable: {
    color: colors.accent,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
  },
  meta: {
    alignItems: 'baseline',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 6px',
  },
  tag: {
    color: colors.textMuted,
    fontSize: '9px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  trustOfficial: {
    color: colors.ok,
  },
  trustVerified: {
    color: colors.textSecondary,
  },
  observed: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 600,
    lineHeight: 1.35,
    margin: 0,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.4,
    margin: 0,
  },
  foot: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 10px',
    justifyContent: 'space-between',
  },
  symbols: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  symbol: {
    'color': colors.textSecondary,
    'fontSize': fontSizes.xs,
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  action: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.accent,
    'cursor': 'pointer',
    'fontFamily': 'inherit',
    'fontSize': fontSizes.xs,
    'padding': 0,
    'textDecoration': 'none',
    ':hover:not(:disabled)': {
      textDecoration: 'underline',
    },
    ':disabled': {
      color: colors.textMuted,
      cursor: 'default',
    },
  },
});

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
  const rowProps = stylex.props(
    styles.row,
    event.severity === 'critical' && styles.rowCritical,
    event.severity === 'notable' && styles.rowNotable,
  );
  const severityProps = stylex.props(
    styles.severity,
    event.severity === 'critical' && styles.severityCritical,
    event.severity === 'notable' && styles.severityNotable,
  );
  const trustProps = stylex.props(
    styles.tag,
    event.trust === 'official' && styles.trustOfficial,
    event.trust === 'verified' && styles.trustVerified,
  );

  return (
    <article {...rowProps} aria-labelledby={titleId}>
      <div {...stylex.props(styles.gutter)}>
        <span className={`num ${stylex.props(styles.time).className}`}>
          <MarketTime value={event.occurredAt} format="month-day-time" zone="market" />
        </span>
        <span {...severityProps}>{EVENT_SEVERITY_LABEL[event.severity]}</span>
      </div>
      <div {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.meta)}>
          <span {...stylex.props(styles.tag)}>{eventSourceLabel(event.source)}</span>
          <span {...trustProps}>{EVENT_TRUST_LABEL[event.trust]}</span>
          <span {...stylex.props(styles.tag)}>{EVENT_CLASS_LABEL[event.class]}</span>
          <span className={`num ${stylex.props(styles.observed).className}`}>
            观察 <MarketTime value={event.observedAt} format="clock" zone="market" />
            {delay ? ` · 慢 ${delay}` : ' · 即时'}
          </span>
        </div>
        <h4 {...stylex.props(styles.title)} id={titleId}>
          {payload.title}
        </h4>
        {payload.summary && <p {...stylex.props(styles.summary)}>{payload.summary}</p>}
        <div {...stylex.props(styles.foot)}>
          <span {...stylex.props(styles.symbols)}>
            {event.symbols.map((symbol) => (
              <a
                className={`num ${stylex.props(styles.symbol).className}`}
                key={symbol}
                href={`/symbol/${encodeURIComponent(symbol)}`}
              >
                {shortSymbol(symbol)}
              </a>
            ))}
          </span>
          <span {...stylex.props(styles.actions)}>
            {payload.url && (
              <a
                aria-label={`打开原文：${payload.title}`}
                {...stylex.props(styles.action)}
                href={payload.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                原文
              </a>
            )}
            <button
              aria-label={CANVAS_ARIA[action](payload.title)}
              className={`evt-row-action--canvas ${stylex.props(styles.action).className}`}
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
