import { describe, expect, it } from 'vitest';
import {
  chartTargetPath,
  symbolAnalysisPath,
  symbolLivePath,
  type ChartUrlDoc,
} from '@kansoku/shared/chartUrl';

function doc(overrides: Partial<ChartUrlDoc>): ChartUrlDoc {
  return {
    id: '2026-07-02-mrvl-intraday',
    type: 'intraday',
    symbol: 'MRVL.US',
    created_at: '2026-07-02T13:30:00Z',
    ...overrides,
  };
}

describe('chartTargetPath', () => {
  it('routes intraday charts to the symbol page pinned to the analysis', () => {
    expect(chartTargetPath(doc({ type: 'intraday' }))).toBe(
      '/symbol/MRVL.US?analysis=2026-07-02-mrvl-intraday',
    );
  });

  it('routes sepa charts to the symbol page pinned to the analysis', () => {
    expect(chartTargetPath(doc({ type: 'sepa', id: '2026-07-02-mrvl-sepa' }))).toBe(
      '/symbol/MRVL.US?analysis=2026-07-02-mrvl-sepa',
    );
  });

  it('routes flow charts to the home page for that market date', () => {
    expect(chartTargetPath(doc({ type: 'flow', symbol: null, id: '2026-07-02-flow' }))).toBe(
      '/?date=2026-07-02',
    );
  });

  it('routes cohort charts to the home page for that market date', () => {
    expect(chartTargetPath(doc({ type: 'cohort', symbol: null, id: '2026-07-02-cohort' }))).toBe(
      '/?date=2026-07-02',
    );
  });

  it('falls back to the home page when a symbol chart is missing its symbol', () => {
    expect(chartTargetPath(doc({ type: 'intraday', symbol: null }))).toBe('/?date=2026-07-02');
  });

  it('encodes special characters in symbol and id', () => {
    expect(symbolAnalysisPath('MRVL US', 'id with space')).toBe(
      '/symbol/MRVL%20US?analysis=id%20with%20space',
    );
  });

  it('omits the analysis query when no id is given', () => {
    expect(symbolAnalysisPath('MRVL.US', null)).toBe('/symbol/MRVL.US');
  });

  it('routes the live view without pinning an analysis', () => {
    expect(symbolLivePath('MRVL US')).toBe('/symbol/MRVL%20US?view=live');
  });
});
