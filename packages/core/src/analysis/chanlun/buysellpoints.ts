import type { BuySellPoint, TimeframeKey, Xianduan, Zhongshu } from '@kansoku/shared/types';
import type { BeichiEvent } from './beichi.js';

function segmentEndpoints(seg: Xianduan): number[] {
  const prices = [seg.bis[0].start.price];
  for (const bi of seg.bis) prices.push(bi.end.price);
  return prices;
}

function segmentExtreme(seg: Xianduan): number {
  const prices = segmentEndpoints(seg);
  return seg.direction === 'up' ? Math.max(...prices) : Math.min(...prices);
}

export function detectBuySellPoints(
  xianduans: Xianduan[],
  zhongshus: Zhongshu[],
  beichis: BeichiEvent[],
  timeframe: TimeframeKey,
): BuySellPoint[] {
  const points: BuySellPoint[] = [];

  for (const event of beichis) {
    const toSeg = xianduans[event.toSegmentIdx];
    if (!toSeg || toSeg.bis.length === 0) continue;

    const isBuy = event.direction === 'down';
    const lastBi = toSeg.bis[toSeg.bis.length - 1];
    const p1 = {
      time: lastBi.end.time,
      price: lastBi.end.price,
    };

    points.push({
      ...p1,
      kind: isBuy ? 'buy1' : 'sell1',
      timeframe,
      refBeichi: { fromSegmentIdx: event.fromSegmentIdx, toSegmentIdx: event.toSegmentIdx },
      confirmed: toSeg.broken,
    });

    const bounce = xianduans[event.toSegmentIdx + 1];
    if (!bounce || bounce.direction === toSeg.direction) continue;
    if (bounce.bis.length < 2) continue;

    const retraceBi = bounce.bis[1];
    const retraceHolds = isBuy ? retraceBi.end.price > p1.price : retraceBi.end.price < p1.price;
    if (!retraceHolds) continue;

    points.push({
      time: retraceBi.end.time,
      price: retraceBi.end.price,
      kind: isBuy ? 'buy2' : 'sell2',
      timeframe,
      refFirstPoint: p1,
      confirmed: retraceBi.end.confirmed,
    });
  }

  for (const zs of zhongshus) {
    const { endTime } = zs;
    if (endTime === null) continue;

    const j = xianduans.findIndex((seg) => seg.startTime >= endTime);
    if (j === -1) continue;

    const escapeSeg = xianduans[j];
    const retrace = xianduans[j + 1];
    if (!retrace) continue;

    const isUpEscape = escapeSeg.direction === 'up' && segmentExtreme(escapeSeg) > zs.priceHigh;
    const isDownEscape = escapeSeg.direction === 'down' && segmentExtreme(escapeSeg) < zs.priceLow;
    if (!isUpEscape && !isDownEscape) continue;
    if (retrace.direction === escapeSeg.direction) continue;

    const retracePrices = segmentEndpoints(retrace);
    const holds = isUpEscape
      ? Math.min(...retracePrices) > zs.priceHigh
      : Math.max(...retracePrices) < zs.priceLow;
    if (!holds) continue;

    const lastBi = retrace.bis[retrace.bis.length - 1];
    points.push({
      time: lastBi.end.time,
      price: lastBi.end.price,
      kind: isUpEscape ? 'buy3' : 'sell3',
      timeframe,
      refZhongshu: { startTime: zs.startTime, endTime },
      confirmed: retrace.broken,
    });
  }

  return points.sort((a, b) => a.time - b.time);
}
