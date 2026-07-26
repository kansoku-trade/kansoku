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
