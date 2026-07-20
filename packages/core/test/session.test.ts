import { describe, expect, it } from 'vitest';
import {
  classifySession,
  easternDate,
  easternMinuteOfDay,
  isCurrentSessionId,
  marketDate,
  offSessionSegments,
} from '../src/marketdata/session.js';

const US_REGULAR = 1784124000;
const US_PRE = 1784109600;
const US_POST = 1784149200;
const US_OVERNIGHT = 1784167200;
const US_WEEKEND = 1784390400;

const HK_REGULAR_AM = 1784080800;
const HK_LUNCH = 1784089800;
const HK_REGULAR_PM = 1784095200;
const HK_CLOSED = 1784073600;
const HK_WEEKEND = 1784340000;

const CN_REGULAR_AM = 1784080800;
const CN_LUNCH = 1784088900;
const CN_REGULAR_PM = 1784095200;
const CN_CLOSED = 1784073600;

describe('classifySession — US (default market)', () => {
  it('classifies regular hours', () => {
    expect(classifySession(US_REGULAR)).toBe('regular');
  });

  it('classifies pre-market', () => {
    expect(classifySession(US_PRE)).toBe('pre');
  });

  it('classifies post-market', () => {
    expect(classifySession(US_POST)).toBe('post');
  });

  it('classifies overnight', () => {
    expect(classifySession(US_OVERNIGHT)).toBe('overnight');
  });

  it('classifies weekend as overnight', () => {
    expect(classifySession(US_WEEKEND)).toBe('overnight');
  });

  it('behaves identically when the market is passed explicitly', () => {
    expect(classifySession(US_REGULAR, 'US')).toBe('regular');
  });
});

describe('classifySession — HK', () => {
  it('classifies morning regular session', () => {
    expect(classifySession(HK_REGULAR_AM, 'HK')).toBe('regular');
  });

  it('classifies the lunch break as off-session', () => {
    expect(classifySession(HK_LUNCH, 'HK')).not.toBe('regular');
  });

  it('classifies afternoon regular session', () => {
    expect(classifySession(HK_REGULAR_PM, 'HK')).toBe('regular');
  });

  it('classifies pre-open hours as off-session with no pre/post distinction', () => {
    expect(classifySession(HK_CLOSED, 'HK')).toBe('overnight');
  });

  it('classifies weekend as off-session', () => {
    expect(classifySession(HK_WEEKEND, 'HK')).not.toBe('regular');
  });
});

describe('classifySession — CN', () => {
  it('classifies morning regular session', () => {
    expect(classifySession(CN_REGULAR_AM, 'CN')).toBe('regular');
  });

  it('classifies the lunch break as off-session', () => {
    expect(classifySession(CN_LUNCH, 'CN')).not.toBe('regular');
  });

  it('classifies afternoon regular session', () => {
    expect(classifySession(CN_REGULAR_PM, 'CN')).toBe('regular');
  });

  it('classifies pre-open hours as off-session', () => {
    expect(classifySession(CN_CLOSED, 'CN')).toBe('overnight');
  });
});

describe('offSessionSegments', () => {
  it('includes the HK lunch gap', () => {
    const segments = offSessionSegments([HK_REGULAR_AM, HK_LUNCH, HK_REGULAR_PM], 'HK');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startTime: HK_LUNCH, endTime: HK_LUNCH });
  });

  it('includes the CN lunch gap', () => {
    const segments = offSessionSegments([CN_REGULAR_AM, CN_LUNCH, CN_REGULAR_PM], 'CN');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startTime: CN_LUNCH, endTime: CN_LUNCH });
  });

  it('defaults to US market and keeps existing regression behavior', () => {
    const segments = offSessionSegments([US_PRE, US_REGULAR, US_POST]);
    expect(segments).toEqual([
      { startTime: US_PRE, endTime: US_PRE, kind: 'pre' },
      { startTime: US_POST, endTime: US_POST, kind: 'post' },
    ]);
  });
});

describe('day boundary across markets', () => {
  const CROSS_MIDNIGHT_TS = 1784167200;

  it('US and HK land on different local trading days for the same instant', () => {
    expect(marketDate('US', new Date(CROSS_MIDNIGHT_TS * 1000))).toBe('2026-07-15');
    expect(marketDate('HK', new Date(CROSS_MIDNIGHT_TS * 1000))).toBe('2026-07-16');
  });
});

describe('existing US regression guard', () => {
  it("easternDate matches marketDate('US', ...)", () => {
    const now = new Date();
    expect(easternDate(now)).toBe(marketDate('US', now));
  });

  it('easternMinuteOfDay is unaffected by the market parameter addition', () => {
    expect(easternMinuteOfDay(US_REGULAR)).toBe(10 * 60);
  });

  it("isCurrentSessionId still checks against today's US date by default", () => {
    const today = easternDate();
    expect(isCurrentSessionId(`${today}-mu-intraday`)).toBe(true);
    expect(isCurrentSessionId('1999-01-01-mu-intraday')).toBe(false);
  });
});
