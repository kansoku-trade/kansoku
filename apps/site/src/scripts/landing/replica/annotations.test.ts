import { describe, expect, it } from 'vitest';
import { buildCandles, type Candle } from '../kline';
import { detect123, detectCandlePatterns, detectDivergence, findPivots } from './annotations';
import { macd } from './indicators';

const candle = (open: number, close: number, high: number, low: number): Candle => ({
  time: 0,
  open,
  close,
  high,
  low,
  up: close >= open,
});

const flat = (count: number, price: number): Candle[] =>
  Array.from({ length: count }, () => candle(price, price, price + 0.2, price - 0.2));

const series = (...parts: Array<Candle | Candle[]>): Candle[] =>
  parts.flat().map((bar, i) => ({ ...bar, time: 1_785_240_000 + i * 300 }));

describe('findPivots', () => {
  it('alternates highs and lows', () => {
    const pivots = findPivots(buildCandles(120, { seed: 4242, start: 100, volatility: 3 }));
    expect(pivots.length).toBeGreaterThan(2);
    for (let i = 1; i < pivots.length; i++) {
      expect(pivots[i].isHigh).toBe(!pivots[i - 1].isHigh);
    }
  });

  it('ignores bars inside the pivot window at both edges', () => {
    for (const pivot of findPivots(buildCandles(60, { seed: 7, start: 50, volatility: 2 }))) {
      expect(pivot.index).toBeGreaterThanOrEqual(3);
      expect(pivot.index).toBeLessThan(57);
    }
  });
});

describe('detect123', () => {
  it('reads a higher low as a bullish structure and confirms on the close above ②', () => {
    const bars = series(
      ...flat(4, 100),
      candle(100, 90, 100, 90),
      ...flat(4, 90),
      candle(90, 104, 105, 90),
      ...flat(4, 104),
      candle(104, 95, 104, 94),
      ...flat(4, 95),
      candle(95, 108, 108, 95),
      ...flat(4, 108),
    );
    const found = detect123(bars);
    expect(found?.kind).toBe('bullish');
    expect(found?.label).toBe('底部 123 结构');
    expect(found!.p3.price).toBeGreaterThan(found!.p1.price);
    expect(found?.trigger).toBe(found?.p2.price);
    expect(found?.confirmIndex).not.toBeNull();
  });

  it('leaves confirmIndex null while price has not closed through ②', () => {
    const bars = series(
      ...flat(4, 100),
      candle(100, 90, 100, 90),
      ...flat(4, 90),
      candle(90, 104, 105, 90),
      ...flat(4, 104),
      candle(104, 95, 104, 94),
      ...flat(8, 96),
    );
    expect(detect123(bars)?.confirmIndex).toBeNull();
  });

  it('returns null when no three alternating pivots hold the structure', () => {
    expect(detect123(flat(40, 100))).toBeNull();
  });
});

describe('detectCandlePatterns', () => {
  it('names a bullish engulfing and marks it confirmed once a close clears its high', () => {
    const bars = series(
      ...flat(3, 100),
      candle(100, 96, 100.5, 95.5),
      candle(95, 101, 101.5, 94.5),
      candle(101, 103, 103.5, 100.5),
      ...flat(3, 103),
    );
    const [found] = detectCandlePatterns(bars);
    expect(found.label).toBe('看涨吞没');
    expect(found.bias).toBe('bullish');
    expect(found.status).toBe('confirmed');
  });

  it('names a bearish engulfing', () => {
    const bars = series(
      ...flat(3, 100),
      candle(100, 104, 104.5, 99.5),
      candle(105, 99, 105.5, 98.5),
      ...flat(3, 99),
    );
    expect(detectCandlePatterns(bars)[0].label).toBe('看跌吞没');
  });

  it('leaves a pattern pending when the next three bars neither confirm nor extend', () => {
    const bars = series(
      ...flat(3, 100),
      candle(100, 96, 100.5, 95.5),
      candle(95, 101, 101.5, 94.5),
      ...flat(3, 100),
    );
    expect(detectCandlePatterns(bars)[0].status).toBe('pending');
  });

  it('reads a long lower wick as a hammer', () => {
    const bars = [...flat(3, 100), candle(100, 100.4, 100.6, 96), ...flat(3, 100.4)];
    expect(detectCandlePatterns(bars)[0].label).toBe('锤子线');
  });

  it('reads a long upper wick as a shooting star', () => {
    const bars = [...flat(3, 100), candle(100, 99.6, 104, 99.4), ...flat(3, 99.6)];
    expect(detectCandlePatterns(bars)[0].label).toBe('射击之星');
  });

  it('never reports two patterns within four bars of each other', () => {
    const found = detectCandlePatterns(
      buildCandles(160, { seed: 99, start: 200, volatility: 4 }),
      4,
    );
    for (let i = 1; i < found.length; i++) {
      expect(found[i].index - found[i - 1].index).toBeGreaterThanOrEqual(4);
    }
  });

  it('honours the limit', () => {
    expect(
      detectCandlePatterns(buildCandles(200, { seed: 31, start: 80, volatility: 3 }), 2).length,
    ).toBeLessThanOrEqual(2);
  });
});

describe('detectDivergence', () => {
  it('pairs a higher price high with a lower MACD high', () => {
    const bars = buildCandles(200, { seed: 20260729, start: 120, volatility: 3.4 });
    const found = detectDivergence(
      bars,
      bars.map((_, i) => 40 - i),
    );
    expect(found?.kind).toBe('top');
    expect(found?.label).toBe('MACD 顶背驰');
    expect(found!.b.price).toBeGreaterThan(found!.a.price);
    expect(found!.b.macd).toBeLessThan(found!.a.macd);
  });

  it('returns null when every swing steps up alongside a rising MACD', () => {
    const bars: Candle[] = [];
    for (let leg = 0; leg < 6; leg++) {
      const base = 100 + leg * 10;
      bars.push(...flat(4, base));
      bars.push(candle(base, base + 6, base + 6, base));
      bars.push(...flat(4, base + 6));
      bars.push(candle(base + 6, base + 3, base + 6, base + 3));
    }
    expect(
      detectDivergence(
        bars,
        bars.map((_, i) => i),
      ),
    ).toBeNull();
  });

  it('runs against the same MACD the chart draws', () => {
    const bars = buildCandles(180, { seed: 424242, start: 930, volatility: 1.5 });
    const found = detectDivergence(bars, macd(bars.map((bar) => bar.close)).dif);
    if (found) {
      expect(found.a.index).toBeLessThan(found.b.index);
      expect(['top', 'bottom']).toContain(found.kind);
    }
  });
});
