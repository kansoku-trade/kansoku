import type { TrainerClosedTrade, TrainerResult } from '@kansoku/pro-api';

export interface SettlementTradeRow {
  tradeId: number;
  direction: TrainerClosedTrade['direction'];
  entryPrice: number;
  exitPrice: number;
  exitReason: TrainerClosedTrade['exitReason'];
  plannedRewardRisk: number | null;
  netR: number;
  mfeGivebackR: number;
}

export interface SettlementSummary {
  terminationReason: TrainerResult['terminationReason'];
  netR: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

export function plannedRewardRisk(trade: TrainerClosedTrade): number | null {
  if (trade.initialRisk <= 0) return null;
  return Math.abs(trade.target - trade.entry.price) / trade.initialRisk;
}

export function mfeGivebackR(trade: TrainerClosedTrade): number {
  return Math.max(0, trade.mfeR - trade.netR);
}

export function settlementTradeRows(trades: readonly TrainerClosedTrade[]): SettlementTradeRow[] {
  return trades.map((trade) => ({
    tradeId: trade.tradeId,
    direction: trade.direction,
    entryPrice: trade.entry.price,
    exitPrice: trade.exit.price,
    exitReason: trade.exitReason,
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
