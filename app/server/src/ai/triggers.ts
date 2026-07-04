export type TriggerKind = "macd_cross" | "level_break" | "flow_flip" | "volume_spike";

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
  target?: number | null;
}

export interface TriggerInput {
  bars: TriggerBar[];
  macdHist: number[];
  flow: number[];
  levels: PredictionLevels;
}

const VOLUME_BASELINE_BARS = 20;
const VOLUME_SPIKE_MULTIPLE = 3;
const HEARTBEAT_MS = 5 * 60 * 1000;

function sign(value: number): number {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function detectMacdCross(macdHist: number[]): Trigger | null {
  if (macdHist.length < 2) return null;
  const prev = macdHist[macdHist.length - 2];
  const last = macdHist[macdHist.length - 1];
  const prevSign = sign(prev);
  const lastSign = sign(last);
  if (prevSign === 0 || lastSign === 0 || prevSign === lastSign) return null;
  const direction = lastSign > 0 ? "golden" : "death";
  return {
    kind: "macd_cross",
    detail: `MACD histogram flipped ${direction} (${prev} -> ${last})`,
  };
}

function detectLevelBreak(bars: TriggerBar[], levels: PredictionLevels): Trigger | null {
  if (bars.length < 2) return null;
  const prevClose = bars[bars.length - 2].close;
  const lastClose = bars[bars.length - 1].close;
  const named: [string, number | null | undefined][] = [
    ["entry", levels.entry],
    ["stop", levels.stop],
    ["target", levels.target],
  ];
  for (const [name, level] of named) {
    if (level == null) continue;
    if (prevClose < level && lastClose >= level) {
      return { kind: "level_break", detail: `Price broke above ${name} ${level} (${prevClose} -> ${lastClose})` };
    }
    if (prevClose > level && lastClose <= level) {
      return { kind: "level_break", detail: `Price broke below ${name} ${level} (${prevClose} -> ${lastClose})` };
    }
  }
  return null;
}

function detectFlowFlip(flow: number[]): Trigger | null {
  if (flow.length < 2) return null;
  const prev = flow[flow.length - 2];
  const last = flow[flow.length - 1];
  const prevSign = sign(prev);
  const lastSign = sign(last);
  if (prevSign === 0 || lastSign === 0 || prevSign === lastSign) return null;
  const direction = lastSign > 0 ? "inflow" : "outflow";
  return {
    kind: "flow_flip",
    detail: `Cumulative capital flow flipped to net ${direction} (${prev} -> ${last})`,
  };
}

function detectVolumeSpike(bars: TriggerBar[]): Trigger | null {
  if (bars.length < VOLUME_BASELINE_BARS + 1) return null;
  const last = bars[bars.length - 1];
  const baseline = bars.slice(bars.length - 1 - VOLUME_BASELINE_BARS, bars.length - 1);
  const avg = baseline.reduce((sum, bar) => sum + bar.volume, 0) / VOLUME_BASELINE_BARS;
  if (avg <= 0) return null;
  if (last.volume > avg * VOLUME_SPIKE_MULTIPLE) {
    return {
      kind: "volume_spike",
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
  return triggers;
}

export function shouldHeartbeat(lastRunAt: number | null, now: number): boolean {
  if (lastRunAt == null) return true;
  return now - lastRunAt >= HEARTBEAT_MS;
}
