import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { ReplayBand } from '../charts/intraday/replayBandPrimitive';

export type { ReplayBand, ReplayBandKind } from '../charts/intraday/replayBandPrimitive';

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function span(bars: readonly RawBar[], from: number, to: number): [number, number] | null {
  const start = bars[from];
  const end = bars[to];
  if (!start || !end) return null;
  return [sec(start.time), sec(end.time)];
}

// The trainer hands the settlement two visibility classes and nothing between them: bars.base holds
// the opening history the case was framed with plus every replay bar the trader stepped through
// (cursor + 1 of them), and the epilogue starts after the case's LAST replay bar. When a session
// ends before the horizon the un-reached replay bars are in neither array, so they get no band —
// there is nowhere on the axis to put one.
export function replayBands(view: TrainerView, epilogue: readonly RawBar[] | null): ReplayBand[] {
  const base = view.bars.base;
  const bands: ReplayBand[] = [];
  const playedCount = Math.min(Math.max(view.cursor + 1, 0), base.length);
  const givenCount = base.length - playedCount;

  // Left-unbounded rather than anchored to base[0]: the 15m/1h tiers reach further back than the
  // base tier does, and every one of those older bars was equally "handed to you at the open".
  const given = givenCount > 0 ? span(base, 0, givenCount - 1) : null;
  if (given) bands.push({ kind: 'given', startTime: 0, endTime: given[1] });

  const played = playedCount > 0 ? span(base, givenCount, base.length - 1) : null;
  if (played) bands.push({ kind: 'played', startTime: played[0], endTime: played[1] });

  const tail = epilogue?.length ? span(epilogue, 0, epilogue.length - 1) : null;
  if (tail) bands.push({ kind: 'epilogue', startTime: tail[0], endTime: tail[1] });

  return bands;
}

export function unreachedBars(view: TrainerView): number {
  return Math.max(0, view.remainingBars);
}
