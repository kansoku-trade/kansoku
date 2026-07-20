import type { LinePoint, RawBar } from '@kansoku/shared/types';
import { toTs } from './indicators.js';
import { easternDate } from '../marketdata/session.js';

// Anchored per US-Eastern trading day, extended hours included — matches how
// the chart displays ETH bars, so the line never jumps mid-view.
export function sessionVwap(bars: RawBar[]): LinePoint[] {
  const out: LinePoint[] = [];
  let day = '';
  let pv = 0;
  let vol = 0;
  for (const bar of bars) {
    const ts = toTs(bar.time);
    const d = easternDate(new Date(ts * 1000));
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const h = Number(bar.high);
    const l = Number(bar.low);
    const c = Number(bar.close);
    const v = Number(bar.volume);
    if (![h, l, c, v].every(Number.isFinite) || v <= 0) {
      if (vol > 0) out.push({ time: ts, value: pv / vol });
      continue;
    }
    pv += ((h + l + c) / 3) * v;
    vol += v;
    out.push({ time: ts, value: pv / vol });
  }
  return out;
}

export function lastVwap(points: LinePoint[]): number | null {
  return points.length ? points.at(-1)!.value : null;
}
