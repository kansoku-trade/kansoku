import { describe, expect, it } from 'vitest';
import { buildCandles } from '../kline';
import { detect123, detectCandlePatterns, detectDivergence } from './annotations';
import { macd } from './indicators';
import { buildMarks, markCount, type Detected } from './marks';

const bars = buildCandles(160, { seed: 20260714, start: 930, volatility: 2.4 });
const detect = (): Detected => ({
  structure: detect123(bars),
  patterns: detectCandlePatterns(bars, 3),
  divergence: detectDivergence(bars, macd(bars.map((bar) => bar.close)).dif),
});

describe('buildMarks', () => {
  it('emits markers in time order', () => {
    const { markers } = buildMarks(bars, detect());
    for (let i = 1; i < markers.length; i++) {
      expect(markers[i].time).toBeGreaterThanOrEqual(markers[i - 1].time);
    }
  });

  it('anchors every marker and connector point on a real bar time', () => {
    const times = new Set(bars.map((bar) => bar.time));
    const { markers, connectors } = buildMarks(bars, detect());
    for (const marker of markers) expect(times.has(marker.time)).toBe(true);
    for (const connector of connectors) {
      for (const point of connector.data) expect(times.has(point.time)).toBe(true);
    }
  });

  it('numbers the 123 pivots and adds the trigger line', () => {
    const structure = detect123(bars);
    expect(structure).not.toBeNull();
    const { markers, connectors } = buildMarks(bars, {
      structure,
      patterns: [],
      divergence: null,
    });
    expect(markers.map((m) => m.text.replace('?', ''))).toEqual(
      expect.arrayContaining(['①', '②', '③']),
    );
    expect(connectors.filter((c) => c.pane === 'price').length).toBeGreaterThanOrEqual(2);
    const trigger = connectors.find((c) => c.data.length === 2 && c.data[0].value === c.data[1].value);
    expect(trigger?.data[0].value).toBe(structure!.trigger);
  });

  it('marks an unconfirmed third pivot with a question mark and skips the 123 arrow', () => {
    const structure = detect123(bars);
    const { markers } = buildMarks(bars, {
      structure: { ...structure!, confirmIndex: null },
      patterns: [],
      divergence: null,
    });
    expect(markers.some((m) => m.text === '③?')).toBe(true);
    expect(markers.some((m) => m.text === '123✓')).toBe(false);
  });

  it('suffixes a confirmed pattern with a tick and a pending one with a question mark', () => {
    const { markers } = buildMarks(bars, {
      structure: null,
      divergence: null,
      patterns: [
        { index: 40, label: '看涨吞没', bias: 'bullish', status: 'confirmed' },
        { index: 80, label: '射击之星', bias: 'bearish', status: 'pending' },
      ],
    });
    expect(markers.map((m) => m.text)).toEqual(['看涨吞没✓', '射击之星?']);
    expect(markers[0].position).toBe('belowBar');
    expect(markers[1].position).toBe('aboveBar');
  });

  it('draws a divergence on both the price and the MACD pane', () => {
    const divergence = detectDivergence(bars, macd(bars.map((bar) => bar.close)).dif);
    expect(divergence).not.toBeNull();
    const { connectors } = buildMarks(bars, { structure: null, patterns: [], divergence });
    expect(connectors.map((c) => c.pane).sort()).toEqual(['macd', 'price']);
  });

  it('produces nothing when nothing was detected', () => {
    expect(buildMarks(bars, { structure: null, patterns: [], divergence: null })).toEqual({
      markers: [],
      connectors: [],
    });
  });
});

describe('markCount', () => {
  it('counts each structure, pattern and divergence once', () => {
    expect(
      markCount({
        structure: detect123(bars),
        patterns: detectCandlePatterns(bars, 3),
        divergence: null,
      }),
    ).toBe(1 + detectCandlePatterns(bars, 3).length);
    expect(markCount({ structure: null, patterns: [], divergence: null })).toBe(0);
  });
});
