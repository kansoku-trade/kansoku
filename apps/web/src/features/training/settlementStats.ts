import {
  trainerMfeGivebackR,
  trainerPlannedRewardRisk,
  type TrainerClosedTrade,
  type TrainerResult,
  type TrainerTradeExit,
  type TrainerTradeLot,
} from '@kansoku/pro-api';
import { FULL_POSITION } from './orderDraft';

export interface SettlementTradeRow {
  tradeId: number;
  direction: TrainerClosedTrade['direction'];
  entries: TrainerTradeLot[];
  exits: TrainerTradeExit[];
  plannedRewardRisk: number | null;
  netR: number;
  mfeGivebackR: number;
}

// A trade recorded before position sizing existed has no `lots` / `exits`, only the averaged pair.
// Reading it as one full-size fill each way is exactly what it was, so both shapes render the same
// way and neither needs a branch further up.
export function tradeEntryFills(trade: TrainerClosedTrade): TrainerTradeLot[] {
  if (trade.lots && trade.lots.length > 0) return trade.lots;
  return [{ ...trade.entry, size: FULL_POSITION }];
}

export function tradeExitFills(trade: TrainerClosedTrade): TrainerTradeExit[] {
  if (trade.exits && trade.exits.length > 0) return trade.exits;
  return [{ ...trade.exit, size: FULL_POSITION, reason: trade.exitReason }];
}

export interface SettlementSummary {
  terminationReason: TrainerResult['terminationReason'];
  netR: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

export const plannedRewardRisk = trainerPlannedRewardRisk;

export const mfeGivebackR = trainerMfeGivebackR;

export function settlementTradeRows(trades: readonly TrainerClosedTrade[]): SettlementTradeRow[] {
  return trades.map((trade) => ({
    tradeId: trade.tradeId,
    direction: trade.direction,
    entries: tradeEntryFills(trade),
    exits: tradeExitFills(trade),
    plannedRewardRisk: plannedRewardRisk(trade),
    netR: trade.netR,
    mfeGivebackR: mfeGivebackR(trade),
  }));
}

export interface SettlementTrack {
  plannedR: number;
  gotR: number;
  givebackR: number;
  tradeCount: number;
}

export interface TrackGeometry {
  gotPct: number;
  gotNegative: boolean;
  giveLeftPct: number;
  givePct: number;
}

export function settlementTrack(trades: readonly TrainerClosedTrade[]): SettlementTrack | null {
  if (trades.length === 0) return null;
  return {
    plannedR: trades.reduce((sum, t) => sum + Math.max(0, plannedRewardRisk(t) ?? 0), 0),
    gotR: trades.reduce((sum, t) => sum + t.netR, 0),
    givebackR: trades.reduce((sum, t) => sum + mfeGivebackR(t), 0),
    tradeCount: trades.length,
  };
}

export function trackGeometry(track: SettlementTrack): TrackGeometry {
  const banked = Math.max(0, track.gotR);
  const scale = Math.max(track.plannedR, banked + track.givebackR, Math.abs(track.gotR), 1);
  const pct = (value: number) => (value / scale) * 100;
  return {
    gotPct: pct(Math.abs(track.gotR)),
    gotNegative: track.gotR < 0,
    giveLeftPct: pct(banked),
    givePct: pct(track.givebackR),
  };
}

export function settlementSummary(result: TrainerResult | null): SettlementSummary | null {
  if (!result) return null;
  return {
    terminationReason: result.terminationReason,
    netR: result.netR ?? 0,
    tradeCount: result.tradeCount ?? 0,
    winCount: result.winCount ?? 0,
    lossCount: result.lossCount ?? 0,
  };
}
