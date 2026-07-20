import {
  type EntryPlanStatus,
  type IntradayEntryPlan,
  type IntradayPrediction,
  type IntradayPriceZone,
  type IntradayTargetContext,
} from '@kansoku/shared/types';
import { pyRound } from '../indicators.js';
import { ENTRY_STATUS_NOTES, ZONE_COLORS } from './constants.js';

export function resolveEntryPlanStatus(
  plan: Pick<IntradayEntryPlan, 'entry' | 'stop'>,
  direction: 'long' | 'short' | 'neutral',
  anchorTs: number | null,
  candles: { time: number; high: number; low: number; close: number }[],
): { status: EntryPlanStatus; note: string | null } | null {
  if (direction === 'neutral' || anchorTs === null) return null;
  const midpoint = (plan.entry + plan.stop) / 2;
  const towardStop = (c: { low: number; high: number; close: number }) =>
    direction === 'long'
      ? c.low <= plan.stop || c.close <= midpoint
      : c.high >= plan.stop || c.close >= midpoint;
  const touchesEntry = (c: { low: number; high: number }) =>
    c.low <= plan.entry && plan.entry <= c.high;
  const hitsStop = (c: { low: number; high: number }) =>
    direction === 'long' ? c.low <= plan.stop : c.high >= plan.stop;

  let triggered = false;
  for (const c of candles) {
    if (c.time < anchorTs) continue;
    if (!triggered) {
      if (touchesEntry(c)) triggered = true;
      else if (towardStop(c))
        return { status: 'invalidated', note: ENTRY_STATUS_NOTES.invalidated };
    } else if (hitsStop(c)) {
      return { status: 'stopped', note: ENTRY_STATUS_NOTES.stopped };
    }
  }
  if (triggered) return { status: 'triggered', note: ENTRY_STATUS_NOTES.triggered };
  return { status: 'waiting', note: null };
}

export function computeIntradayEntryPlan(
  raw: NonNullable<IntradayPrediction['entry_plan']>,
  direction: string,
  extraZones: IntradayPrediction['price_zones'] = [],
): IntradayEntryPlan {
  const entry = Number(raw.entry);
  const stop = Number(raw.stop);
  const targetFromPct = (pct: number) =>
    pyRound(direction === 'short' ? entry * (1 - pct / 100) : entry * (1 + pct / 100), 4);
  const pctFromTarget = (target: number) => {
    if (!entry) return 0;
    const rawPct =
      direction === 'short' ? ((entry - target) / entry) * 100 : ((target - entry) / entry) * 100;
    return pyRound(rawPct, 4);
  };
  const rawT1Pct = Number(raw.target1_pct ?? 3);
  const rawT2Pct = Number(raw.target2_pct ?? 6);
  const target1 = Number.isFinite(Number(raw.target1))
    ? Number(raw.target1)
    : targetFromPct(rawT1Pct);
  const target2 = Number.isFinite(Number(raw.target2))
    ? Number(raw.target2)
    : targetFromPct(rawT2Pct);
  const t1Pct = raw.target1 == null ? rawT1Pct : pctFromTarget(target1);
  const t2Pct = raw.target2 == null ? rawT2Pct : pctFromTarget(target2);
  let risk: number;
  let reward: number;
  if (direction === 'short') {
    risk = stop - entry;
    reward = entry - target2;
  } else {
    risk = entry - stop;
    reward = target2 - entry;
  }
  const rr = risk > 0 ? reward / risk : 0;
  const entryZone = normalizePriceZone(raw.entry_zone, 'entry', '入场参考');
  const targetContexts: IntradayTargetContext[] = [
    {
      key: 'target1',
      label: raw.target1_label ?? 'T1',
      price: target1,
      zone: normalizePriceZone(raw.target1_zone, 'target', 'T1 参考结构'),
      note: raw.target1_note,
      condition: raw.target1_condition,
    },
    {
      key: 'target2',
      label: raw.target2_label ?? 'T2',
      price: target2,
      zone: normalizePriceZone(raw.target2_zone, 'target', 'T2 参考结构'),
      note: raw.target2_note,
      condition: raw.target2_condition,
    },
  ];
  const priceZones = (extraZones ?? [])
    .map((z) => normalizePriceZone(z, z.kind ?? 'watch', z.label ?? '压力/阻力区'))
    .filter((z): z is IntradayPriceZone => z?.kind === 'resistance');
  return {
    entry,
    stop,
    target1,
    target1_pct: t1Pct,
    target2,
    target2_pct: t2Pct,
    rr,
    rr_ok: rr >= 2,
    rr_great: rr >= 3,
    note: raw.note ?? '',
    rationale: raw.rationale ?? '',
    stop_note: raw.stop_note ?? '',
    entry_zone: entryZone,
    target_contexts: targetContexts,
    price_zones: dedupeZones(priceZones),
  };
}

function normalizePriceZone(
  raw: Partial<IntradayPriceZone> | undefined,
  kind: IntradayPriceZone['kind'],
  fallbackLabel: string,
  fallbackPrice?: number,
): IntradayPriceZone | null {
  const low = Number(raw?.low ?? fallbackPrice);
  const high = Number(raw?.high ?? raw?.low ?? fallbackPrice);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return {
    kind: raw?.kind ?? kind,
    label: raw?.label ?? fallbackLabel,
    low: pyRound(lo, 4),
    high: pyRound(hi, 4),
    note: raw?.note,
    source: raw?.source,
    sources: raw?.sources?.filter(Boolean) ?? (raw?.source ? [raw.source] : undefined),
    color: raw?.color ?? ZONE_COLORS[raw?.kind ?? kind] ?? ZONE_COLORS.watch,
  };
}

function dedupeZones(zones: IntradayPriceZone[]): IntradayPriceZone[] {
  const seen = new Set<string>();
  return zones.filter((z) => {
    const key = `${z.kind}:${z.label}:${z.low}:${z.high}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
