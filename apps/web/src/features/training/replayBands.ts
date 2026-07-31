import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { ReplayBand } from '../charts/intraday/replayBandPrimitive';

export type { ReplayBand, ReplayBandKind } from '../charts/intraday/replayBandPrimitive';

export const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

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

// The played bars are the trailing playedCount elements of base (see replayBands above), so their
// last one — the cursor's bar — is always base's own last element, even when playedCount is 0 and
// that last element is a given bar rather than a played one.
export function cursorBarTime(view: TrainerView): number {
  const bar = view.bars.base.at(-1);
  return bar ? sec(bar.time) : 0;
}

// bars.base is [question bars, revealed replay bars] and the revealed run is exactly cursor + 1
// long (engine view.ts), so the question's own count never changes as the episode advances and
// neither does this line.
//
// The anchor is the FIRST REPLAYED bar, drawn off its leading edge — not the last question bar off
// its trailing edge. The two are the same place on the base tier, but on 15m/1h the boundary can
// fall inside an aggregated bar, and that bar holds replayed prices. Anchoring ahead of it keeps
// the line from ever claiming a bar is pure setup when the trader has already stepped through part
// of it. Before the first step there is no replayed bar, so it falls back to the trailing edge of
// the last bar — which is exactly where "you start here" belongs when nothing has been played.
export interface ReplayDividerAnchor {
  time: number;
  edge: 'before' | 'after';
}

export function replayDivider(view: TrainerView): ReplayDividerAnchor | null {
  const base = view.bars.base;
  const playedCount = Math.min(Math.max(view.cursor + 1, 0), base.length);
  const givenCount = base.length - playedCount;
  const firstPlayed = base[givenCount];
  if (firstPlayed) return { time: sec(firstPlayed.time), edge: 'before' };
  const lastGiven = base[givenCount - 1];
  return lastGiven ? { time: sec(lastGiven.time), edge: 'after' } : null;
}
