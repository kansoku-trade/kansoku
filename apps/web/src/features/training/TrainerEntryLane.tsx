import * as stylex from '@stylexjs/stylex';
import type { TrainerDirection } from '@kansoku/pro-api';
import { fmt } from '@web/lib/format';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { formatRewardRisk, meetsRewardRiskFloor, rewardRiskRatio } from './orderDraft';
import { TrainerNote } from './TrainerNote';
import type { EntryDraftApi } from './useEntryDraft';

const DIRECTION_LABEL: Record<TrainerDirection, string> = { long: '做多', short: '做空' };

const styles = stylex.create({
  lane: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'flex',
    flex: '0 0 auto',
    gap: '8px',
    height: '38px',
    overflowX: 'clip',
    overflowY: 'visible',
    padding: '0 12px',
    position: 'relative',
  },
  group: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
    gap: '4px',
  },
  separator: {
    backgroundColor: colors.borderStrong,
    flex: '0 0 auto',
    height: '16px',
    width: '1px',
  },
  spacer: {
    marginLeft: 'auto',
  },
  label: {
    color: colors.textSecondary,
    flex: '0 0 auto',
    fontSize: fontSizes.sm,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  hintWarn: {
    color: colors.accent,
  },
  num: {
    flex: '0 0 auto',
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  numStop: {
    color: colors.down,
  },
  numTarget: {
    color: colors.up,
  },
  numRewardRisk: {
    color: colors.accent,
  },
  numWarn: {
    color: colors.accent,
  },
});

function sideRule(direction: TrainerDirection, entry: number): string {
  return direction === 'long'
    ? `止损要在入场线 ${fmt(entry)} 下方，目标要在上方`
    : `止损要在入场线 ${fmt(entry)} 上方，目标要在下方`;
}

function entryHint(entry: EntryDraftApi): { text: string; warn: boolean } {
  const { direction, autoFill, stale, placement } = entry;
  if (!direction) return { text: '先选方向，入场票就会出现在图上', warn: false };
  if (autoFill === 'unavailable')
    return { text: '已经走出来的这段里找不到能放止损的位置，自己拖 SL 放一个', warn: true };
  if (stale)
    return {
      text: `现价 ${fmt(entry.entry)} 已经越过你放的线，${sideRule(direction, entry.entry)}`,
      warn: true,
    };
  const missing: string[] = [];
  if (placement.stop === null) missing.push('SL 放止损');
  if (placement.target === null) missing.push('TP 放目标');
  if (missing.length > 0) return { text: `从入场票上拖出 ${missing.join('、')}`, warn: false };
  if (autoFill === 'filled')
    return { text: '止损在最近的摆动点外一档，目标按 2 : 1 铺好，两条都能再拖', warn: false };
  return { text: `再按一次「${DIRECTION_LABEL[direction]}」可以取消`, warn: false };
}

// Present in both states of the lane: with nothing drawn they pick the side, and with a draft on
// the chart the picked side redraws it while the other side flips it. Dropping them from the draft
// state would leave no way back to the opposite direction short of submitting.
function DirectionButtons({ entry }: { entry: EntryDraftApi }) {
  return (
    <div className={`trainer-lane-group ${stylex.props(styles.group).className}`}>
      <button
        className="btn btn--long"
        aria-pressed={entry.direction === 'long'}
        onClick={() => entry.pickDirection('long')}
      >
        做多
      </button>
      <button
        className="btn btn--short"
        aria-pressed={entry.direction === 'short'}
        onClick={() => entry.pickDirection('short')}
      >
        做空
      </button>
    </div>
  );
}

export interface TrainerEntryLaneProps {
  entry: EntryDraftApi;
  note: string;
  onNoteChange: (value: string) => void;
}

export function TrainerEntryLane({ entry, note, onNoteChange }: TrainerEntryLaneProps) {
  const { draft } = entry;
  const hint = entryHint(entry);

  if (!draft) {
    return (
      <div className={`trainer-lane ${stylex.props(styles.lane).className}`}>
        <span className={`trainer-lane-label ${stylex.props(styles.label).className}`}>方向</span>
        <DirectionButtons entry={entry} />
        <div className={`trainer-lane-sep ${stylex.props(styles.separator).className}`} />
        <span className={`trainer-lane-label ${stylex.props(styles.label).className}`}>
          市价直接进
        </span>
        <div className={`trainer-lane-group ${stylex.props(styles.group).className}`}>
          <button className="btn btn--long" onClick={() => entry.quickEntry('long')}>
            市价做多
          </button>
          <button className="btn btn--short" onClick={() => entry.quickEntry('short')}>
            市价做空
          </button>
        </div>
        <div className={`trainer-lane-sep ${stylex.props(styles.separator).className}`} />
        <span
          className={`trainer-lane-hint${hint.warn ? ' trainer-lane-hint--warn' : ''} ${stylex.props(styles.hint, hint.warn && styles.hintWarn).className}`}
        >
          {hint.text}
        </span>
      </div>
    );
  }

  const rr = rewardRiskRatio(draft);
  const rrOk = meetsRewardRiskFloor(draft);

  return (
    <div className={`trainer-lane ${stylex.props(styles.lane).className}`}>
      <span className={draft.direction === 'long' ? 'trainer-chip-long' : 'trainer-chip-short'}>
        {DIRECTION_LABEL[draft.direction]}
      </span>
      <span className={`trainer-lane-num ${stylex.props(styles.num).className}`}>
        入场 {fmt(draft.entry)}
      </span>
      <span
        className={`trainer-lane-num trainer-lane-num--stop ${stylex.props(styles.num, styles.numStop).className}`}
      >
        止损 {fmt(draft.stop)}
      </span>
      <span
        className={`trainer-lane-num trainer-lane-num--target${rrOk ? '' : ' trainer-lane-num--warn'} ${stylex.props(styles.num, styles.numTarget, !rrOk && styles.numWarn).className}`}
      >
        目标 {fmt(draft.target1)}
      </span>
      <span
        className={`trainer-lane-num trainer-lane-num--rr${rrOk ? '' : ' trainer-lane-num--warn'} ${stylex.props(styles.num, styles.numRewardRisk, !rrOk && styles.numWarn).className}`}
      >
        盈亏比 {rr === null ? '—' : `${formatRewardRisk(rr)} : 1`}
      </span>
      <span className={`trainer-lane-spacer ${stylex.props(styles.spacer).className}`} />
      {/* The entry buttons live on the ticket, next to the plan they commit — one place to send an
          order, not two that have to be kept in step. */}
      {!rrOk && (
        <span
          className={`trainer-lane-hint trainer-lane-hint--warn ${stylex.props(styles.hint, styles.hintWarn).className}`}
        >
          低于 1.5 下限
        </span>
      )}
      <TrainerNote label="备注" value={note} onChange={onNoteChange} hint="入场理由，可以留空" />
      <DirectionButtons entry={entry} />
    </div>
  );
}
