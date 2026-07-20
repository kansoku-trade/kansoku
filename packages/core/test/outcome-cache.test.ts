import { describe, expect, it } from 'vitest';
import type { AnalysisOutcome } from '@kansoku/shared/types';
import { createDb } from '../src/db/index.js';
import { getResolvedOutcomes, saveResolvedOutcome } from '../src/cockpit/outcomeCache.js';

function outcome(status: AnalysisOutcome['status'], pct = 1): AnalysisOutcome {
  return { status, pct_since_anchor: pct, resolved_at: status === 'open' ? null : 1751400000 };
}

describe('outcome cache', () => {
  it('stores resolved outcomes and reads them back', async () => {
    const db = createDb(':memory:');
    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('hit_target', 4.2),
      db,
    );
    await saveResolvedOutcome(
      { chartId: 'c2', symbol: 'MU.US', direction: 'short' },
      outcome('hit_stop', -2),
      db,
    );
    const map = await getResolvedOutcomes(['c1', 'c2', 'c3'], db);
    expect(map.size).toBe(2);
    expect(map.get('c1')).toEqual({
      status: 'hit_target',
      pct_since_anchor: 4.2,
      resolved_at: 1751400000,
    });
    expect(map.get('c3')).toBeUndefined();
  });

  it('refuses to store open outcomes', async () => {
    const db = createDb(':memory:');
    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('open'),
      db,
    );
    expect((await getResolvedOutcomes(['c1'], db)).size).toBe(0);
  });

  it('keeps the first resolution on duplicate saves', async () => {
    const db = createDb(':memory:');
    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('hit_target', 4),
      db,
    );
    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('hit_stop', -9),
      db,
    );
    expect((await getResolvedOutcomes(['c1'], db)).get('c1')?.status).toBe('hit_target');
  });

  it('returns an empty map for no ids', async () => {
    const db = createDb(':memory:');
    expect((await getResolvedOutcomes([], db)).size).toBe(0);
  });
});
