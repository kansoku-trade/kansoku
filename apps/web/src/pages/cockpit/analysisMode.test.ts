import { describe, expect, it } from 'vitest';
import { resolveAnalysisViewMode } from './analysisMode.js';

describe('resolveAnalysisViewMode', () => {
  it('uses the live view when explicitly requested', () => {
    expect(resolveAnalysisViewMode('live', '2026-07-06-mrvl-intraday')).toBe('live');
  });

  it('pins a selected historical analysis', () => {
    expect(resolveAnalysisViewMode(null, '2026-07-06-mrvl-intraday')).toBe('pinned');
  });

  it('follows the latest analysis by default', () => {
    expect(resolveAnalysisViewMode(null, null)).toBe('latest');
  });
});
