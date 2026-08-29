import type { TrainerReviewEvent, TrainerReviewEventKind } from '@kansoku/pro-api';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const EVENT_MARK: Record<TrainerReviewEventKind, string> = {
  entry: '▲',
  stop: '✕',
  target: '◎',
  manual_exit: '●',
  horizon_exit: '■',
  coach: '◆',
};

const styles = stylex.create({
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  track: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    height: '18px',
    position: 'relative',
  },
  trackFog: {
    backgroundColor: 'rgb(232 232 232 / 0.05)',
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tick: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    color: colors.textSecondary,
    cursor: 'pointer',
    fontSize: '11px',
    lineHeight: '16px',
    padding: '0 2px',
    position: 'absolute',
    top: 0,
    transform: 'translateX(-50%)',
  },
  tickEntry: {
    color: colors.up,
  },
  tickStop: {
    color: colors.down,
  },
  tickTarget: {
    color: colors.up,
  },
  tickCoach: {
    color: colors.accent,
  },
  brush: {
    accentColor: colors.accent,
    width: '100%',
  },
  scale: {
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    gap: '10px',
    justifyContent: 'space-between',
  },
});

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
    <div {...stylex.props(styles.timeline)} data-testid="trainer-review-timeline">
      <div {...stylex.props(styles.track)}>
        <div {...stylex.props(styles.trackFog)} style={{ left: `${pct(playedThrough)}%` }} />
        {events.map((event, index) =>
          event.barIndex === null ? null : (
            <button
              key={`${event.kind}-${event.coachId ?? index}`}
              {...stylex.props(
                styles.tick,
                event.kind === 'entry' && styles.tickEntry,
                event.kind === 'stop' && styles.tickStop,
                event.kind === 'target' && styles.tickTarget,
                event.kind === 'coach' && styles.tickCoach,
              )}
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
        {...stylex.props(styles.brush)}
        min={0}
        max={max}
        value={brush}
        aria-label="重放到第几根"
        onChange={(e) => onBrush(Number(e.target.value))}
      />
      <div {...stylex.props(styles.scale)}>
        <span className="num">B0</span>
        <span className="trainer-settle-hint">拖时间轴，图还原成当时所见</span>
        <span className="num">B{brush}</span>
      </div>
    </div>
  );
}
