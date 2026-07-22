import { describe, expect, it } from 'vitest';
import type { RawBar, TimeframeKey } from '@kansoku/shared/types';
import { chanOverlay } from '../intraday/markers.js';
import { computeChanStructure } from './index.js';

interface Waypoint {
  bar: number;
  price: number;
}

const WAYPOINTS: Waypoint[] = [
  { bar: 0, price: 95 },
  { bar: 6, price: 100 },
  { bar: 12, price: 112 },
  { bar: 18, price: 103 },
  { bar: 24, price: 116 },
  { bar: 30, price: 105 },
  { bar: 36, price: 120 },
  { bar: 42, price: 108 },
  { bar: 48, price: 114 },
  { bar: 54, price: 106 },
  { bar: 60, price: 118 },
  { bar: 66, price: 101 },
  { bar: 72, price: 113 },
  { bar: 78, price: 104 },
  { bar: 84, price: 119 },
  { bar: 90, price: 110 },
  { bar: 96, price: 125 },
  { bar: 102, price: 115 },
  { bar: 108, price: 122 },
  { bar: 114, price: 105 },
  { bar: 120, price: 160 },
  { bar: 126, price: 145 },
  { bar: 132, price: 170 },
  { bar: 150, price: 150 },
];

const BASE_TS = Date.UTC(2026, 0, 5, 14, 30, 0) / 1000;

function buildBars(): RawBar[] {
  const totalBars = WAYPOINTS[WAYPOINTS.length - 1].bar + 1;
  const closes: number[] = Array.from({ length: totalBars });
  let segIdx = 0;
  for (let i = 0; i < totalBars; i++) {
    while (segIdx < WAYPOINTS.length - 2 && i > WAYPOINTS[segIdx + 1].bar) segIdx++;
    const a = WAYPOINTS[segIdx];
    const b = WAYPOINTS[segIdx + 1];
    const t = b.bar === a.bar ? 0 : (i - a.bar) / (b.bar - a.bar);
    closes[i] = a.price + (b.price - a.price) * t;
  }
  return closes.map((close, i) => ({
    time: new Date((BASE_TS + i * 300) * 1000).toISOString(),
    open: close,
    high: close + 0.3,
    low: close - 0.3,
    close,
    volume: 1000,
  }));
}

describe('computeChanStructure', () => {
  it('runs the full detector pipeline over a synthetic zigzag without throwing', () => {
    const bars = buildBars();
    const macdHist: (number | null)[] = bars.map(() => null);
    const timeframe: TimeframeKey = 'm15';

    const result = computeChanStructure(bars, macdHist, timeframe);

    expect(Array.isArray(result.fenxings)).toBe(true);
    expect(Array.isArray(result.bis)).toBe(true);
    expect(Array.isArray(result.xianduans)).toBe(true);
    expect(Array.isArray(result.zhongshus)).toBe(true);
    expect(Array.isArray(result.buySellPoints)).toBe(true);

    expect(result.fenxings.length).toBeGreaterThan(0);
    expect(result.bis.length).toBeGreaterThan(0);
    expect(result.xianduans.length).toBeGreaterThan(0);
    expect(result.zhongshus.length).toBeGreaterThan(0);

    for (const point of result.buySellPoints) {
      expect(point.timeframe).toBe(timeframe);
    }

    expect({
      fenxings: result.fenxings.length,
      bis: result.bis.length,
      xianduans: result.xianduans.length,
      zhongshus: result.zhongshus.length,
      buySellPoints: result.buySellPoints.length,
    }).toMatchInlineSnapshot(`
      {
        "bis": 20,
        "buySellPoints": 0,
        "fenxings": 21,
        "xianduans": 5,
        "zhongshus": 1,
      }
    `);

    const overlay = chanOverlay(result, timeframe);
    expect(Array.isArray(overlay.markers)).toBe(true);
    expect(Array.isArray(overlay.priceConnectors)).toBe(true);
    expect(overlay.macdConnectors).toEqual([]);
    for (const marker of overlay.markers) {
      expect(typeof marker.tooltip).toBe('string');
      expect(marker.tooltip?.length).toBeGreaterThan(0);
    }
  });

  it('returns all-empty arrays for empty input without throwing', () => {
    const result = computeChanStructure([], [], 'm5');

    expect(result).toEqual({
      fenxings: [],
      bis: [],
      xianduans: [],
      zhongshus: [],
      buySellPoints: [],
    });
  });
});
