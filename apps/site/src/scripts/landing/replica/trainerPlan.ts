import type { Candle } from '../kline';
import { snapshot, toCandles, volumesOf } from './snapshot';

export const TRAINER_DIVIDER = 72;
export const TRAINER_CLOSED_R = 1.1;
export const TRAINER_START_CURSOR = TRAINER_DIVIDER + 28;

export const trainerCandles = (): Candle[] => toCandles(snapshot.trainer.bars);
export const trainerVolumes = (): number[] => volumesOf(snapshot.trainer.bars);
export const TRAINER_EPISODE_BARS = snapshot.trainer.bars.length;

export interface TrainerPlan {
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  risk: number;
  rewardRisk: number;
}

export const trainerPlan = (candles: Candle[] = trainerCandles()): TrainerPlan => {
  const entry = candles[TRAINER_DIVIDER].close;
  let swingLow = Infinity;
  for (let i = Math.max(0, TRAINER_DIVIDER - 10); i <= TRAINER_DIVIDER; i++) {
    if (candles[i].low < swingLow) swingLow = candles[i].low;
  }
  const stop = swingLow - (entry - swingLow) * 0.06;
  const risk = entry - stop;
  return {
    direction: 'long',
    entry,
    stop,
    target: entry + risk * 2,
    risk,
    rewardRisk: 2,
  };
};

export interface TrainerStats {
  last: number;
  tradeR: number;
  tradePct: number;
  sessionR: number;
  remaining: number;
  done: boolean;
}

export const trainerStatsAt = (
  cursor: number,
  candles: Candle[] = trainerCandles(),
  plan: TrainerPlan = trainerPlan(candles),
): TrainerStats => {
  const index = Math.min(candles.length - 1, Math.max(TRAINER_DIVIDER, cursor - 1));
  const last = candles[index].close;
  const tradeR = (last - plan.entry) / plan.risk;
  return {
    last,
    tradeR,
    tradePct: ((last - plan.entry) / plan.entry) * 100,
    sessionR: tradeR + TRAINER_CLOSED_R,
    remaining: candles.length - (index + 1),
    done: index >= candles.length - 1,
  };
};

export const signedR = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}R`;
export const signedPct = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
