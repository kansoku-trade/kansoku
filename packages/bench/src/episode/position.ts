import type { EpisodeClosedTrade, EpisodeTradeExit, EpisodeTradeLot } from '../schema/episode.js';
import type { EpisodeTradeReason } from '../schema/tradeReason.js';

export const FULL_POSITION_SIZE = 1;
export const POSITION_SIZE_EPSILON = 1e-9;

export interface PositionLot extends EpisodeTradeLot {
  remaining: number;
}

export interface PositionState {
  tradeId: number;
  direction: 'long' | 'short';
  decisionBar: number;
  decisionTime: string;
  lots: PositionLot[];
  exits: EpisodeTradeExit[];
  entryPrice: number;
  entryTime: string;
  initialStop: number;
  // Locked at the first fill and never recomputed, including across adds. The R unit is the ruler
  // the whole episode is measured with, and a ruler may not stretch while it is measuring: recompute
  // it on an add and a position sitting at +2R silently becomes +1.4R with no price movement.
  riskUnit: number;
  realizedR: number;
  realizedFrictionR: number;
  stop: number;
  target: number;
  holdingBars: number;
  mfeR: number;
  maeR: number;
  entryReason: EpisodeTradeReason;
}

export interface PositionFill {
  time: string;
  price: number;
  size: number;
}

export interface PositionExit {
  time: string;
  price: number;
  reason: EpisodeClosedTrade['exitReason'];
}

export function openSize(position: PositionState): number {
  return position.lots.reduce((total, lot) => total + lot.remaining, 0);
}

function weightedPrice(points: readonly { price: number; size: number }[]): number {
  const size = points.reduce((total, point) => total + point.size, 0);
  return points.reduce((total, point) => total + point.price * point.size, 0) / size;
}

function openEntryPrice(lots: readonly PositionLot[], fallback: number): number {
  const open = lots.filter((lot) => lot.remaining > 0);
  if (open.length === 0) return fallback;
  return weightedPrice(open.map((lot) => ({ price: lot.price, size: lot.remaining })));
}

export function openPosition(
  base: Omit<
    PositionState,
    | 'lots'
    | 'exits'
    | 'entryPrice'
    | 'entryTime'
    | 'realizedR'
    | 'realizedFrictionR'
    | 'holdingBars'
    | 'mfeR'
    | 'maeR'
  >,
  fill: PositionFill,
): PositionState {
  return {
    ...base,
    lots: [{ time: fill.time, price: fill.price, size: fill.size, remaining: fill.size }],
    exits: [],
    entryPrice: fill.price,
    entryTime: fill.time,
    realizedR: 0,
    realizedFrictionR: 0,
    holdingBars: 0,
    mfeR: 0,
    maeR: 0,
  };
}

export function addLot(position: PositionState, fill: PositionFill): PositionState {
  const lots: PositionLot[] = [
    ...position.lots,
    { time: fill.time, price: fill.price, size: fill.size, remaining: fill.size },
  ];
  return { ...position, lots, entryPrice: openEntryPrice(lots, position.entryPrice) };
}

export function reduceLots(
  position: PositionState,
  size: number,
  exit: PositionExit,
  costRate: number,
): PositionState {
  const lots = position.lots.map((lot) => ({ ...lot }));
  let remainingToClose = size;
  let realizedR = position.realizedR;
  let realizedFrictionR = position.realizedFrictionR;
  let closed = 0;
  for (const lot of lots) {
    if (remainingToClose <= POSITION_SIZE_EPSILON) break;
    if (lot.remaining <= 0) continue;
    const quantity = Math.min(lot.remaining, remainingToClose);
    const move = position.direction === 'long' ? exit.price - lot.price : lot.price - exit.price;
    realizedR += (move * quantity) / position.riskUnit;
    realizedFrictionR += (costRate * (lot.price + exit.price) * quantity) / position.riskUnit;
    lot.remaining =
      lot.remaining - quantity <= POSITION_SIZE_EPSILON ? 0 : lot.remaining - quantity;
    remainingToClose -= quantity;
    closed += quantity;
  }
  return {
    ...position,
    lots,
    exits: [
      ...position.exits,
      { time: exit.time, price: exit.price, size: closed, reason: exit.reason },
    ],
    realizedR,
    realizedFrictionR,
    entryPrice: openEntryPrice(lots, position.entryPrice),
  };
}

export function unrealizedR(position: PositionState, price: number): number {
  const move = position.lots.reduce((total, lot) => {
    if (lot.remaining <= 0) return total;
    const gain = position.direction === 'long' ? price - lot.price : lot.price - price;
    return total + gain * lot.remaining;
  }, 0);
  return move / position.riskUnit;
}

export function equityR(position: PositionState, price: number): number {
  return position.realizedR + unrealizedR(position, price);
}

export function closedTradeOf(position: PositionState): EpisodeClosedTrade {
  const lastExit = position.exits.at(-1);
  if (!lastExit) throw new Error('cannot record a trade that never exited');
  const grossR = position.realizedR;
  const frictionR = position.realizedFrictionR;
  return {
    tradeId: position.tradeId,
    direction: position.direction,
    decisionBar: position.decisionBar,
    decisionTime: position.decisionTime,
    entry: { time: position.entryTime, price: weightedPrice(position.lots) },
    exit: { time: lastExit.time, price: weightedPrice(position.exits) },
    exitReason: lastExit.reason,
    initialStop: position.initialStop,
    finalStop: position.stop,
    target: position.target,
    initialRisk: position.riskUnit,
    grossR,
    frictionR,
    netR: grossR - frictionR,
    mfeR: position.mfeR,
    maeR: position.maeR,
    holdingBars: position.holdingBars,
    entryReason: position.entryReason,
    lots: position.lots.map((lot) => ({ time: lot.time, price: lot.price, size: lot.size })),
    exits: position.exits.map((exit) => ({ ...exit })),
  };
}
