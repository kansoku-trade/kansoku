import { describe, expect, it } from 'vitest';
import { decodePreviewEnvelope } from './useIntradayPreview.js';

const built = { kind: 'intraday' } as unknown as ReturnType<typeof decodePreviewEnvelope>['built'];

describe('decodePreviewEnvelope', () => {
  it('decodes a data envelope into built + clears degraded', () => {
    expect(decodePreviewEnvelope({ type: 'data', data: { built } }, false)).toEqual({
      built,
      degraded: false,
    });
  });

  it('treats a status error before any successful build as a hard error', () => {
    expect(
      decodePreviewEnvelope({ type: 'status', degraded: true, error: 'bad symbol' }, false),
    ).toEqual({
      error: 'bad symbol',
    });
  });

  it('treats a status error after a successful build as transient degraded', () => {
    expect(decodePreviewEnvelope({ type: 'status', degraded: true, error: 'boom' }, true)).toEqual({
      degraded: true,
    });
  });

  it('ignores unknown envelope shapes', () => {
    expect(decodePreviewEnvelope({ type: 'other' }, false)).toEqual({});
    expect(decodePreviewEnvelope(null, false)).toEqual({});
  });

  it('decodes prediction overlay fields from a data envelope', () => {
    expect(
      decodePreviewEnvelope(
        {
          type: 'data',
          data: { built, prediction_updated_at: '2026-07-21T10:00:00Z', prediction_stale: true },
        },
        false,
      ),
    ).toEqual({
      built,
      degraded: false,
      predictionUpdatedAt: '2026-07-21T10:00:00Z',
      predictionStale: true,
    });
  });

  it('leaves prediction overlay fields absent when the data envelope has none', () => {
    expect(decodePreviewEnvelope({ type: 'data', data: { built } }, false)).toEqual({
      built,
      degraded: false,
    });
  });
});
