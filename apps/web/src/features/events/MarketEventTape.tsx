import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { EventCanvasPhase } from '@kansoku/core/contract/events';
import type { MarketEvent } from '@kansoku/shared/types';
import { NoteBlock } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { MarketEventCard } from './MarketEventCard';
import type { MarketEventFeedState } from './useMarketEventFeed';
import { useEventCanvasActions } from './EventCanvasHost';

const DEFAULT_VISIBLE = 12;

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  degraded: {
    color: colors.down,
    fontSize: fontSizes.xs,
    letterSpacing: '0.02em',
  },
  rows: {
    backgroundColor: colors.border,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  more: {
    'alignSelf': 'flex-start',
    'backgroundColor': 'transparent',
    'borderWidth': 0,
    'color': colors.accent,
    'cursor': 'pointer',
    'fontFamily': 'inherit',
    'fontSize': fontSizes.sm,
    'padding': '2px 0',
    ':hover:not(:disabled)': {
      textDecoration: 'underline',
    },
    ':disabled': {
      color: colors.textMuted,
      cursor: 'default',
    },
  },
  moreError: {
    color: colors.down,
    fontSize: fontSizes.xs,
    letterSpacing: '0.02em',
  },
});

export interface MarketEventTapeProps {
  feed: MarketEventFeedState;
  // The home tape filters to events that already happened; the symbol tape shows
  // the feed as-is. Both share this renderer so the card behaviour cannot drift.
  events?: MarketEvent[];
  emptyText?: string;
  initialVisible?: number;
  onGenerateCanvas?: (event: MarketEvent) => void;
  onOpenCanvas?: (slug: string) => void;
  canvasPhaseOf?: (eventId: string) => EventCanvasPhase | null;
}

export function MarketEventTape({
  feed,
  events,
  emptyText = '暂无已发生的事件',
  initialVisible = DEFAULT_VISIBLE,
  onGenerateCanvas,
  onOpenCanvas,
  canvasPhaseOf,
}: MarketEventTapeProps) {
  const hosted = useEventCanvasActions();
  const generate = onGenerateCanvas ?? hosted?.onEventCanvas;
  const open = onOpenCanvas ?? hosted?.onOpenCanvas;
  const phaseOf = canvasPhaseOf ?? hosted?.phaseOf;
  const [visible, setVisible] = useState(initialVisible);
  const rows = events ?? feed.events;
  const shown = rows.slice(0, visible);
  const hasMore = visible < rows.length || !feed.exhausted;

  const revealMore = () => {
    const next = visible + Math.max(1, initialVisible);
    setVisible(next);
    // Reaching past what is loaded is exactly the moment to fetch an older page.
    if (next > rows.length && !feed.exhausted && !feed.loadingMore) void feed.loadMore();
  };

  if (feed.status === 'loading') return <NoteBlock>事件流加载中…</NoteBlock>;
  if (feed.status === 'empty') return <NoteBlock>{emptyText}</NoteBlock>;
  if (feed.status === 'degraded' && rows.length === 0)
    return <NoteBlock>事件流已断开，正在重连{feed.error ? `（${feed.error}）` : ''}</NoteBlock>;

  return (
    <div {...stylex.props(styles.root)}>
      {feed.status === 'degraded' && (
        <div {...stylex.props(styles.degraded)} role="status">
          事件流已断开，下面是最后一次同步的内容{feed.error ? `（${feed.error}）` : ''}
        </div>
      )}
      <div {...stylex.props(styles.rows)}>
        {shown.map((event) => (
          <MarketEventCard
            canvasPhase={phaseOf?.(event.id)}
            event={event}
            key={event.id}
            onGenerateCanvas={generate}
            onOpenCanvas={open}
          />
        ))}
      </div>
      {feed.moreError && <div {...stylex.props(styles.moreError)}>{feed.moreError}</div>}
      {hasMore && (
        <button
          {...stylex.props(styles.more)}
          disabled={feed.loadingMore}
          onClick={revealMore}
          type="button"
        >
          {feed.loadingMore ? '加载中…' : '显示更多事件'}
        </button>
      )}
    </div>
  );
}
