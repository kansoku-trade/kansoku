import { describe, expect, it } from 'vitest';
import { encodeKlineText, isUsHalfDay } from '@kansoku/shared/klineText';
import type { RawBar } from '@kansoku/shared/types';

function bar(time: string, close = 100, volume = 1000): RawBar {
  return { time, open: close, high: close + 1, low: close - 1, close, volume };
}

describe('encodeKlineText', () => {
  it('segments US intraday bars by trading date and session', () => {
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: '5m',
      bars: [
        bar('2026-07-21T08:00:00Z'), // 04:00 ET → pre
        bar('2026-07-21T13:30:00Z'), // 09:30 ET → reg
        bar('2026-07-21T20:05:00Z'), // 16:05 ET → post
      ],
    });

    expect(text.split('\n')).toEqual([
      '# NVDA.US 5m · ET · 全时段 · 3 根',
      '# time,o,h,l,c,v',
      '## 2026-07-21 pre',
      '04:00,100.00,101.00,99.00,100.00,1000',
      '## 2026-07-21 reg',
      '09:30,100.00,101.00,99.00,100.00,1000',
      '## 2026-07-21 post',
      '16:05,100.00,101.00,99.00,100.00,1000',
    ]);
  });

  it('rolls bars after 20:00 ET into the next trading day pre session', () => {
    // 2026-07-22T00:30Z is 20:30 ET on the 21st — overnight, so it belongs to
    // the 22nd, and 02:20 ET on the 22nd belongs to the 22nd as well.
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: '5m',
      bars: [bar('2026-07-22T00:30:00Z'), bar('2026-07-22T06:20:00Z')],
    });

    expect(text).toContain('## 2026-07-22 pre');
    expect(text.match(/## /g)).toHaveLength(1);
  });

  it('rolls a Friday overnight bar past the weekend', () => {
    // 2026-07-25T00:30Z is 20:30 ET Friday the 24th → next weekday is Monday.
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: '5m',
      bars: [bar('2026-07-25T00:30:00Z')],
    });

    expect(text).toContain('## 2026-07-27 pre');
  });

  it('keeps the regular session open until 16:00 on a normal day', () => {
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: '5m',
      bars: [bar('2026-07-21T19:55:00Z')], // 15:55 ET
    });

    expect(text).toContain('## 2026-07-21 reg');
  });

  it('closes the regular session at 13:00 on a half day', () => {
    // 2026-11-27 is the Friday after the fourth Thursday of November.
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: '5m',
      bars: [
        bar('2026-11-27T17:55:00Z'), // 12:55 ET → still reg
        bar('2026-11-27T18:05:00Z'), // 13:05 ET → post on a half day
      ],
    });

    expect(text).toContain('## 2026-11-27 reg');
    expect(text).toContain('## 2026-11-27 post');
  });

  it('filters to the regular session and says so in the header', () => {
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: '5m',
      sessions: 'reg',
      bars: [bar('2026-07-21T08:00:00Z'), bar('2026-07-21T13:30:00Z'), bar('2026-07-21T20:05:00Z')],
    });

    expect(text).toContain('仅盘中 · 1 根');
    expect(text).not.toContain('pre');
    expect(text).not.toContain('post');
  });

  it('appends bar-aligned indicators as columns and leaves nulls empty', () => {
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: '5m',
      bars: [bar('2026-07-21T13:30:00Z'), bar('2026-07-21T13:35:00Z')],
      indicators: { dif: [null, 0.4550123], dea: [null, 0.401], hist: [null, -0.0247] },
    });

    const lines = text.split('\n');
    expect(lines[1]).toBe('# time,o,h,l,c,v,dif,dea,hist');
    expect(lines[3]).toBe('09:30,100.00,101.00,99.00,100.00,1000,,,');
    expect(lines[4]).toBe('09:35,100.00,101.00,99.00,100.00,1000,0.455,0.401,-0.0247');
  });

  it('refuses to encode indicators that do not align with the bars', () => {
    expect(() =>
      encodeKlineText({
        symbol: 'NVDA.US',
        period: '5m',
        bars: [bar('2026-07-21T13:30:00Z')],
        indicators: { dif: [0.1, 0.2] },
      }),
    ).toThrow(/align one-to-one/);
  });

  it('uses four decimals below one dollar and two at or above', () => {
    const text = encodeKlineText({
      symbol: 'PENNY.US',
      period: '5m',
      bars: [
        {
          time: '2026-07-21T13:30:00Z',
          open: 0.8523456,
          high: 0.8712,
          low: 0.8401,
          close: 0.8688,
          volume: 1000,
        },
        bar('2026-07-21T13:35:00Z', 12.3456),
      ],
    });

    expect(text).toContain('09:30,0.8523,0.8712,0.8401,0.8688,1000');
    expect(text).toContain('09:35,12.35,13.35,11.35,12.35,1000');
  });

  it('rounds volume to an integer', () => {
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: '5m',
      bars: [bar('2026-07-21T13:30:00Z', 100, 2430788.358814)],
    });

    expect(text).toContain(',2430788');
  });

  it('writes daily bars with a full date and no session headers', () => {
    const text = encodeKlineText({
      symbol: 'NVDA.US',
      period: 'day',
      bars: [bar('2026-07-21T20:00:00Z'), bar('2026-07-22T20:00:00Z')],
    });

    expect(text.split('\n')).toEqual([
      '# NVDA.US day · ET · 未分时段 · 2 根',
      '# time,o,h,l,c,v',
      '2026-07-21,100.00,101.00,99.00,100.00,1000',
      '2026-07-22,100.00,101.00,99.00,100.00,1000',
    ]);
  });

  it('uses the market timezone and skips segmentation outside the US', () => {
    const text = encodeKlineText({
      symbol: '700.HK',
      period: '5m',
      market: 'HK',
      bars: [bar('2026-07-21T01:30:00Z')], // 09:30 HKT
    });

    expect(text).toContain('# 700.HK 5m · HKT · 未分时段 · 1 根');
    expect(text).toContain('2026-07-21 09:30,100.00');
    expect(text).not.toContain('## ');
  });

  it('says the filter did not apply rather than silently returning everything', () => {
    const text = encodeKlineText({
      symbol: '700.HK',
      period: '5m',
      market: 'HK',
      sessions: 'reg',
      bars: [bar('2026-07-21T01:30:00Z'), bar('2026-07-20T23:00:00Z')],
    });

    expect(text).toContain('该市场不支持时段过滤，已返回全部');
    expect(text).toContain('· 2 根');
  });

  it('handles an empty series', () => {
    const text = encodeKlineText({ symbol: 'NVDA.US', period: '5m', bars: [] });

    expect(text).toBe('# NVDA.US 5m · ET · 全时段 · 0 根\n# time,o,h,l,c,v');
  });

  it('rejects an unparseable bar time instead of emitting a wrong one', () => {
    expect(() =>
      encodeKlineText({ symbol: 'NVDA.US', period: '5m', bars: [bar('not-a-time')] }),
    ).toThrow(/invalid bar time/);
  });
});

describe('isUsHalfDay', () => {
  it('flags the Friday after Thanksgiving', () => {
    expect(isUsHalfDay('2026-11-27')).toBe(true);
    expect(isUsHalfDay('2025-11-28')).toBe(true);
  });

  it('does not flag other November Fridays', () => {
    expect(isUsHalfDay('2026-11-20')).toBe(false);
    expect(isUsHalfDay('2026-11-06')).toBe(false);
  });

  it('flags Christmas Eve and July 3 on weekdays only', () => {
    expect(isUsHalfDay('2026-12-24')).toBe(true); // Thursday
    expect(isUsHalfDay('2027-12-24')).toBe(true); // Friday
    expect(isUsHalfDay('2022-12-24')).toBe(false); // Saturday
    expect(isUsHalfDay('2026-07-03')).toBe(true); // Friday
    expect(isUsHalfDay('2027-07-03')).toBe(false); // Saturday
  });
});
