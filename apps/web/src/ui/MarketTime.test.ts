import { describe, expect, it } from 'vitest';
import { resolveMarketTimePresentation } from './MarketTime';

describe('MarketTime display priority', () => {
  const marketOpen = '2026-07-02T13:30:00Z';

  it('keeps Eastern Time primary by default and exposes local time second', () => {
    const result = resolveMarketTimePresentation({
      value: marketOpen,
      preference: 'market',
      timeZone: 'Asia/Singapore',
    });

    expect(result.label).toBe('2026-07-02 09:30 ET');
    expect(result.tooltip).toMatch(/^本地时间 2026-07-02 21:30 /);
  });

  it('puts local time first and moves Eastern Time into the tooltip', () => {
    const result = resolveMarketTimePresentation({
      value: marketOpen,
      preference: 'local',
      timeZone: 'Asia/Singapore',
    });

    expect(result.label).toMatch(/^2026-07-02 21:30 /);
    expect(result.tooltip).toBe('美东时间 2026-07-02 09:30 ET');
  });

  it('preserves the requested compact format for a local-first label', () => {
    const result = resolveMarketTimePresentation({
      value: marketOpen,
      preference: 'local',
      timeZone: 'Asia/Singapore',
      format: 'clock',
    });

    expect(result.label).toBe('21:30');
    expect(result.tooltip).toBe('美东时间 2026-07-02 09:30 ET');
  });

  it('does not add a redundant tooltip when both zones share the wall clock', () => {
    expect(
      resolveMarketTimePresentation({
        value: marketOpen,
        preference: 'local',
        timeZone: 'America/Toronto',
      }),
    ).toEqual({ label: '2026-07-02 09:30 ET', tooltip: null });
  });
});

describe('MarketTime market awareness', () => {
  const hkOpen = '2026-07-02T02:00:00Z';

  it('formats in Hong Kong time for the HK market', () => {
    const result = resolveMarketTimePresentation({
      value: hkOpen,
      preference: 'market',
      timeZone: 'Asia/Singapore',
      market: 'HK',
    });

    expect(result.label).toBe('2026-07-02 10:00 HKT');
  });

  it('formats in Beijing time for the CN market', () => {
    const result = resolveMarketTimePresentation({
      value: hkOpen,
      preference: 'market',
      timeZone: 'Asia/Singapore',
      market: 'CN',
    });

    expect(result.label).toBe('2026-07-02 10:00 CST');
  });

  it('labels the tooltip 港股（香港时间） for HK when local time takes priority', () => {
    const result = resolveMarketTimePresentation({
      value: hkOpen,
      preference: 'local',
      timeZone: 'America/New_York',
      market: 'HK',
    });

    expect(result.tooltip).toBe('港股（香港时间） 2026-07-02 10:00 HKT');
  });

  it('labels the tooltip 北京时间 for CN when local time takes priority', () => {
    const result = resolveMarketTimePresentation({
      value: hkOpen,
      preference: 'local',
      timeZone: 'America/New_York',
      market: 'CN',
    });

    expect(result.tooltip).toBe('北京时间 2026-07-02 10:00 CST');
  });

  it('shows no local-time alternative when the viewer shares the HK wall clock', () => {
    expect(
      resolveMarketTimePresentation({
        value: hkOpen,
        preference: 'local',
        timeZone: 'Asia/Hong_Kong',
        market: 'HK',
      }),
    ).toEqual({ label: '2026-07-02 10:00 HKT', tooltip: null });
  });

  it('still shows a local-time alternative for HK when the viewer is in a different zone', () => {
    const result = resolveMarketTimePresentation({
      value: hkOpen,
      preference: 'market',
      timeZone: 'America/New_York',
      market: 'HK',
    });

    expect(result.tooltip).toMatch(/^本地时间 2026-07-01 22:00 /);
  });

  it('defaults to the US market when no market prop is given', () => {
    const result = resolveMarketTimePresentation({
      value: '2026-07-02T13:30:00Z',
      preference: 'market',
      timeZone: 'Asia/Singapore',
    });

    expect(result.label).toBe('2026-07-02 09:30 ET');
  });
});
