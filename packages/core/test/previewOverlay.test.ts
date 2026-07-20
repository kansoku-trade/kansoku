import { describe, expect, it } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import { overlayAnalysisInput } from '../src/realtime/previewOverlay.js';

function makeDoc(input: Record<string, unknown>): ChartDoc {
  return {
    id: '2026-07-21-nvda-intraday',
    schema_version: 1,
    type: 'intraday',
    title: 'NVDA 短线多周期',
    symbol: 'NVDA.US',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    input,
    built: { kind: 'intraday' } as unknown as ChartDoc['built'],
  };
}

const previewInput = {
  symbol: 'NVDA.US',
  session: 'intraday',
  timeframes: { m5: [], m15: [], h1: [] },
};

describe('overlayAnalysisInput', () => {
  it('merges the latest doc prediction and context while preserving preview fields', () => {
    const doc = makeDoc({
      symbol: 'NVDA.US',
      prediction: { direction: 'long', anchor: 100 },
      context: { generated_at: '2026-07-21T14:00:00.000Z', conclusion: { stance: 'long' } },
    });

    const merged = overlayAnalysisInput(previewInput, doc);

    expect(merged.prediction).toEqual({ direction: 'long', anchor: 100 });
    expect(merged.context).toEqual({
      generated_at: '2026-07-21T14:00:00.000Z',
      conclusion: { stance: 'long' },
    });
    expect(merged.symbol).toBe('NVDA.US');
    expect(merged.session).toBe('intraday');
    expect(merged.timeframes).toBe(previewInput.timeframes);
  });

  it('returns the input unchanged with no latest doc, adding no prediction or context keys', () => {
    const merged = overlayAnalysisInput(previewInput, null);

    expect(merged).toBe(previewInput);
    expect(merged).not.toHaveProperty('prediction');
    expect(merged).not.toHaveProperty('context');
  });

  it('does not add a context key when the analysis doc omits one', () => {
    const doc = makeDoc({ symbol: 'NVDA.US', prediction: { direction: 'short' } });

    const merged = overlayAnalysisInput(previewInput, doc);

    expect(merged.prediction).toEqual({ direction: 'short' });
    expect(merged).not.toHaveProperty('context');
  });
});
