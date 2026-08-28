import { useMemo } from 'react';
import type { MarketEvent } from '@kansoku/shared/types';
import { occurredAtOrBefore } from '../events/eventFeed';
import { EventSourceHealth } from '../events/EventSourceHealth';
import { MarketEventTape } from '../events/MarketEventTape';
import { useEventSourceHealth } from '../events/useEventSourceHealth';
import { useMarketEventFeed } from '../events/useMarketEventFeed';

// The rail is narrow and the calendar sits above it, so the tape opens on a short
// window and grows on demand instead of pushing everything else off screen.
export const HOME_EVENT_VISIBLE = 8;

export function HomeEventTimeline({
  live,
  onGenerateCanvas,
}: {
  live: boolean;
  onGenerateCanvas?: (event: MarketEvent) => void;
}) {
  const feed = useMarketEventFeed({ live });
  const health = useEventSourceHealth(live);
  // The calendar above already owns the future; this half of the section is the
  // record of what actually happened.
  const occurred = useMemo(() => occurredAtOrBefore(feed.events, Date.now()), [feed.events]);

  return (
    <div className="home-event-timeline">
      <MarketEventTape
        emptyText="今天还没有已发生的市场事件"
        events={occurred}
        feed={feed}
        initialVisible={HOME_EVENT_VISIBLE}
        onGenerateCanvas={onGenerateCanvas}
      />
      <EventSourceHealth
        error={health.error}
        loading={health.loading}
        sources={health.sources}
      />
    </div>
  );
}
