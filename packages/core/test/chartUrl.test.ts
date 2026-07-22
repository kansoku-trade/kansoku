import { describe, expect, it } from 'vitest';
import { chartDeepLink } from '../src/platform/chartUrl.js';
import type { ChartUrlDoc } from '@kansoku/shared/chartUrl';

function doc(overrides: Partial<ChartUrlDoc>): ChartUrlDoc {
  return {
    id: '2026-07-02-mrvl-intraday',
    type: 'intraday',
    symbol: 'MRVL.US',
    created_at: '2026-07-02T13:30:00Z',
    ...overrides,
  };
}

describe('chartDeepLink', () => {
  it('wraps the symbol analysis path in the kansoku:// route scheme', () => {
    expect(chartDeepLink(doc({ type: 'intraday' }))).toBe(
      'kansoku://route/symbol/MRVL.US?analysis=2026-07-02-mrvl-intraday',
    );
  });

  it('wraps the home date path in the kansoku:// route scheme', () => {
    expect(chartDeepLink(doc({ type: 'flow', symbol: null, id: '2026-07-02-flow' }))).toBe(
      'kansoku://route/?date=2026-07-02',
    );
  });
});
