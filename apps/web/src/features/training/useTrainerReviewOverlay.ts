import { useEffect } from 'react';
import type { TrainerClosedTrade } from '@kansoku/pro-api';
import {
  PositionBoxPrimitive,
  type PositionBoxData,
} from '../charts/intraday/positionBoxPrimitive';
import {
  ReplayBandPrimitive,
  type ReplayBand,
  type ReplayDivider,
} from '../charts/intraday/replayBandPrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import { tradeEntryFills } from './settlementStats';

// The box is the plan as it was drawn, so its entry line is the first fill — the price `initialStop`
// and `target` were set against. Using the size-weighted average instead collapses the risk side of
// the box towards the stop on a scaled trade and shows a reward-to-risk nobody planned.
export function tradeBox(trade: TrainerClosedTrade): PositionBoxData {
  const first = tradeEntryFills(trade)[0];
  return {
    startTime: Math.floor(Date.parse(first.time) / 1000),
    endTime: Math.floor(Date.parse(trade.exit.time) / 1000),
    entry: first.price,
    stop: trade.initialStop,
    target1: trade.target,
    target2: trade.target,
    dimmed: trade.exitReason === 'stop',
  };
}

export function useTrainerReviewOverlay(
  handle: DrawingChartHandle | null,
  trades: readonly TrainerClosedTrade[],
  bands: readonly ReplayBand[],
  dividers: readonly ReplayDivider[] = NO_DIVIDERS,
): void {
  useEffect(() => {
    if (!handle) return;
    const { series } = handle;
    const bandLayer = new ReplayBandPrimitive();
    series.attachPrimitive(bandLayer);
    bandLayer.setData([...bands], [...dividers]);
    const boxes = trades.map((trade) => {
      const box = new PositionBoxPrimitive();
      series.attachPrimitive(box);
      box.setData(tradeBox(trade));
      return box;
    });
    // The play chart is parked on the last bar, which is the wrong frame for a settlement: the
    // trade and the visibility bands both sit further left, and at thumbnail height only the whole
    // case is legible. Refits when the epilogue is toggled, since that changes what "whole" means.
    if (bands.length > 0) handle.chart.timeScale().fitContent();
    return () => {
      series.detachPrimitive(bandLayer);
      for (const box of boxes) series.detachPrimitive(box);
    };
  }, [handle, trades, bands, dividers]);
}

const NO_DIVIDERS: readonly ReplayDivider[] = [];
