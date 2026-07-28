import type { TrainerReviewEvent, TrainerReviewEventKind } from '@kansoku/pro-api';

const EVENT_MARK: Record<TrainerReviewEventKind, string> = {
  entry: '▲',
  stop: '✕',
  target: '◎',
  manual_exit: '●',
  horizon_exit: '■',
  coach: '◆',
};

export interface TrainerReviewTimelineProps {
  max: number;
  brush: number;
  playedThrough: number;
  events: readonly TrainerReviewEvent[];
  onBrush: (bar: number) => void;
}

/**
 * The brush is a range input rather than a canvas: it is one number, and dragging it must stay
 * cheap enough to be smooth. Every position is already in memory, so nothing here goes over IPC.
 */
export function TrainerReviewTimeline({
  max,
  brush,
  playedThrough,
  events,
  onBrush,
}: TrainerReviewTimelineProps) {
  const pct = (bar: number) => (max === 0 ? 0 : (bar / max) * 100);
  return (
    <div className="trainer-review-timeline" data-testid="trainer-review-timeline">
      <div className="trainer-review-track">
        <div className="trainer-review-track-fog" style={{ left: `${pct(playedThrough)}%` }} />
        {events.map((event, index) =>
          event.barIndex === null ? null : (
            <button
              key={`${event.kind}-${event.coachId ?? index}`}
              className={`trainer-review-tick trainer-review-tick--${event.kind}`}
              style={{ left: `${pct(event.barIndex)}%` }}
              title={event.label}
              onClick={() => onBrush(event.barIndex!)}
            >
              {EVENT_MARK[event.kind]}
            </button>
          ),
        )}
      </div>
      <input
        type="range"
        className="trainer-review-brush"
        min={0}
        max={max}
        value={brush}
        aria-label="重放到第几根"
        onChange={(e) => onBrush(Number(e.target.value))}
      />
      <div className="trainer-review-scale">
        <span className="num">B0</span>
        <span className="trainer-settle-hint">拖时间轴，图还原成当时所见</span>
        <span className="num">B{brush}</span>
      </div>
    </div>
  );
}
