export type TriggerKind =
  'macd_cross' | 'level_break' | 'flow_flip' | 'volume_spike' | 'zone_break' | 'day_level_break';

export interface Trigger {
  kind: TriggerKind;
  detail: string;
}

export interface TriggerBar {
  time: number;
  close: number;
  volume: number;
}

export interface PredictionLevels {
  entry?: number | null;
  stop?: number | null;
  target1?: number | null;
  target2?: number | null;
}

export interface TriggerZone {
  label: string;
  low: number;
  high: number;
}

export interface NamedLevel {
  name: string;
  value: number;
}

export interface TriggerInput {
  bars: TriggerBar[];
  macdHist: number[];
  flow: number[];
  levels: PredictionLevels;
  zones?: TriggerZone[];
  dayLevels?: NamedLevel[];
}

const VOLUME_BASELINE_BARS = 20;
const VOLUME_SPIKE_MULTIPLE = 3;
const HEARTBEAT_MS = 5 * 60 * 1000;
const FLOW_FLIP_MIN_PEAK_RATIO = 0.05;

function sign(value: number): number {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function detectMacdCross(macdHist: number[]): Trigger | null {
  if (macdHist.length < 2) return null;
  const prev = macdHist.at(-2)!;
  const last = macdHist.at(-1)!;
  const prevSign = sign(prev);
  const lastSign = sign(last);
  if (prevSign === 0 || lastSign === 0 || prevSign === lastSign) return null;
  const direction = lastSign > 0 ? 'golden' : 'death';
  return {
    kind: 'macd_cross',
    detail: `MACD histogram flipped ${direction} (${prev} -> ${last})`,
  };
}

function lastTwoCloses(bars: TriggerBar[]): [number, number] | null {
  if (bars.length < 2) return null;
  return [bars.at(-2)!.close, bars.at(-1)!.close];
}

function crossedLevel(
  prevClose: number,
  lastClose: number,
  level: number,
): 'above' | 'below' | null {
  if (prevClose < level && lastClose >= level) return 'above';
  if (prevClose > level && lastClose <= level) return 'below';
  return null;
}

function detectNamedLevelBreak(
  bars: TriggerBar[],
  named: NamedLevel[],
  kind: TriggerKind,
): Trigger | null {
  const closes = lastTwoCloses(bars);
  if (!closes) return null;
  const [prevClose, lastClose] = closes;
  for (const { name, value } of named) {
    const cross = crossedLevel(prevClose, lastClose, value);
    if (cross) {
      return {
        kind,
        detail: `Price broke ${cross} ${name} ${value} (${prevClose} -> ${lastClose})`,
      };
    }
  }
  return null;
}

function detectLevelBreak(bars: TriggerBar[], levels: PredictionLevels): Trigger | null {
  const named: NamedLevel[] = [];
  const pairs: [string, number | null | undefined][] = [
    ['entry', levels.entry],
    ['stop', levels.stop],
    ['target1', levels.target1],
    ['target2', levels.target2],
  ];
  for (const [name, value] of pairs) {
    if (value != null) named.push({ name, value });
  }
  return detectNamedLevelBreak(bars, named, 'level_break');
}

function zonePosition(price: number, zone: TriggerZone): -1 | 0 | 1 {
  if (price < zone.low) return -1;
  if (price > zone.high) return 1;
  return 0;
}

function detectZoneBreak(bars: TriggerBar[], zones: TriggerZone[]): Trigger | null {
  const closes = lastTwoCloses(bars);
  if (!closes) return null;
  const [prevClose, lastClose] = closes;
  for (const zone of zones) {
    if (!Number.isFinite(zone.low) || !Number.isFinite(zone.high)) continue;
    const prev = zonePosition(prevClose, zone);
    const last = zonePosition(lastClose, zone);
    if (prev === last) continue;
    const where = `zone "${zone.label}" ${zone.low}-${zone.high}`;
    const move = `(${prevClose} -> ${lastClose})`;
    let detail: string;
    if (last === 0) detail = `Price entered ${where} ${move}`;
    else if (prev === 0)
      detail = `Price exited ${where} ${last > 0 ? 'upward' : 'downward'} ${move}`;
    else detail = `Price crossed through ${where} ${move}`;
    return { kind: 'zone_break', detail };
  }
  return null;
}

function detectFlowFlip(flow: number[]): Trigger | null {
  if (flow.length < 2) return null;
  const prev = flow.at(-2)!;
  const last = flow.at(-1)!;
  const prevSign = sign(prev);
  const lastSign = sign(last);
  if (prevSign === 0 || lastSign === 0 || prevSign === lastSign) return null;
  // Suppress flips that hover around zero: near the zero line the cumulative
  // series can flip sign on every tick and would fire this trigger repeatedly.
  const peak = flow.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
  if (peak <= 0 || Math.abs(last) < FLOW_FLIP_MIN_PEAK_RATIO * peak) return null;
  const direction = lastSign > 0 ? 'inflow' : 'outflow';
  return {
    kind: 'flow_flip',
    detail: `Cumulative capital flow flipped to net ${direction} (${prev} -> ${last})`,
  };
}

function detectVolumeSpike(bars: TriggerBar[]): Trigger | null {
  if (bars.length < VOLUME_BASELINE_BARS + 1) return null;
  const last = bars.at(-1)!;
  const baseline = bars.slice(bars.length - 1 - VOLUME_BASELINE_BARS, bars.length - 1);
  const avg = baseline.reduce((sum, bar) => sum + bar.volume, 0) / VOLUME_BASELINE_BARS;
  if (avg <= 0) return null;
  if (last.volume > avg * VOLUME_SPIKE_MULTIPLE) {
    return {
      kind: 'volume_spike',
      detail: `Volume ${last.volume} exceeded ${VOLUME_SPIKE_MULTIPLE}x the ${VOLUME_BASELINE_BARS}-bar average ${avg}`,
    };
  }
  return null;
}

export function detectTriggers(input: TriggerInput): Trigger[] {
  const triggers: Trigger[] = [];
  const macd = detectMacdCross(input.macdHist);
  if (macd) triggers.push(macd);
  const level = detectLevelBreak(input.bars, input.levels);
  if (level) triggers.push(level);
  const flow = detectFlowFlip(input.flow);
  if (flow) triggers.push(flow);
  const volume = detectVolumeSpike(input.bars);
  if (volume) triggers.push(volume);
  if (input.zones?.length) {
    const zone = detectZoneBreak(input.bars, input.zones);
    if (zone) triggers.push(zone);
  }
  if (input.dayLevels?.length) {
    const day = detectNamedLevelBreak(input.bars, input.dayLevels, 'day_level_break');
    if (day) triggers.push(day);
  }
  return triggers;
}

export function shouldHeartbeat(lastRunAt: number | null, now: number): boolean {
  if (lastRunAt == null) return true;
  return now - lastRunAt >= HEARTBEAT_MS;
}
