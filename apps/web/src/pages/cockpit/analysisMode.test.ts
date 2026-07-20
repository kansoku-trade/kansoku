import { describe, expect, it } from 'vitest';
import { resolveAnalysisViewMode, resolveEffectiveMode } from './analysisMode.js';

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

describe('resolveEffectiveMode', () => {
  const todayEastern = '2026-07-21';

  it('keeps latest mode when the latest analysis is from today', () => {
    expect(resolveEffectiveMode('latest', '2026-07-21-mrvl-intraday', todayEastern)).toBe(
      'latest',
    );
  });

  it('downgrades latest mode to live when the latest analysis is stale', () => {
    expect(resolveEffectiveMode('latest', '2026-07-20-mrvl-intraday', todayEastern)).toBe('live');
  });

  it('keeps latest mode when there is no analysis yet', () => {
    expect(resolveEffectiveMode('latest', null, todayEastern)).toBe('latest');
  });

  it('never downgrades a pinned analysis', () => {
    expect(resolveEffectiveMode('pinned', '2026-07-20-mrvl-intraday', todayEastern)).toBe(
      'pinned',
    );
  });

  it('never downgrades an explicit live view', () => {
    expect(resolveEffectiveMode('live', '2026-07-20-mrvl-intraday', todayEastern)).toBe('live');
    expect(resolveEffectiveMode('live', null, todayEastern)).toBe('live');
  });
});
