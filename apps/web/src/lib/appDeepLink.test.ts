import { describe, expect, it } from 'vitest';
import { parseAppDeepLink } from '@kansoku/shared/appDeepLink';

describe('parseAppDeepLink', () => {
  it('converts a durable localhost analysis link into an environment-independent route', () => {
    expect(
      parseAppDeepLink('http://localhost:5199/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3'),
    ).toEqual({
      kind: 'symbol-analysis',
      route: '/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3',
      symbol: 'DRAM.US',
      analysisId: '2026-07-09-dram-intraday-3',
    });
  });

  it('recognizes cockpit links across legacy, relative, and packaged origins', () => {
    expect(parseAppDeepLink('http://127.0.0.1:5199/symbol/MU.US')?.route).toBe('/symbol/MU.US');
    expect(parseAppDeepLink('/symbol/MU.US')?.route).toBe('/symbol/MU.US');
    expect(parseAppDeepLink('app://-/symbol/MU.US')?.route).toBe('/symbol/MU.US');
  });

  it('preserves the explicit live cockpit mode', () => {
    expect(parseAppDeepLink('/symbol/MU.US?view=live')?.route).toBe('/symbol/MU.US?view=live');
  });

  it('recognizes a pinned SEPA dashboard link', () => {
    expect(
      parseAppDeepLink('http://localhost:5199/symbol/sepa/TSM.US?analysis=2026-07-20-tsm-sepa'),
    ).toEqual({
      kind: 'symbol-sepa',
      route: '/symbol/sepa/TSM.US?analysis=2026-07-20-tsm-sepa',
      symbol: 'TSM.US',
      analysisId: '2026-07-20-tsm-sepa',
    });
  });

  it('recognizes the living-dashboard SEPA link (no pinned analysis)', () => {
    expect(parseAppDeepLink('/symbol/sepa/TSM.US')).toEqual({
      kind: 'symbol-sepa',
      route: '/symbol/sepa/TSM.US',
      symbol: 'TSM.US',
      analysisId: null,
    });
  });

  it('does not let the SEPA route fall through to the generic symbol-cockpit match', () => {
    const link = parseAppDeepLink('/symbol/sepa/MU.US');
    expect(link?.kind).toBe('symbol-sepa');
  });

  it('rejects a malformed encoded symbol on the SEPA route', () => {
    expect(parseAppDeepLink('/symbol/sepa/%ZZ')).toBeNull();
  });

  it('normalizes legacy chart-id links so the existing chart redirect can resolve them', () => {
    expect(parseAppDeepLink('http://localhost:5199/charts/2026-07-06-mu-intraday-2')).toEqual({
      kind: 'chart',
      route: '/charts/2026-07-06-mu-intraday-2',
      chartId: '2026-07-06-mu-intraday-2',
    });
  });

  it('does not reclassify external or wrong-port links as app routes', () => {
    expect(parseAppDeepLink('https://example.com/symbol/MU.US')).toBeNull();
    expect(parseAppDeepLink('http://localhost:9999/symbol/MU.US')).toBeNull();
    expect(parseAppDeepLink('http://localhost:5199/settings')).toBeNull();
  });
});
