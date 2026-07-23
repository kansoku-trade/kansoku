import { describe, expect, it } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import { PREDICTION_STALE_MS, predictionStale, sepaStale } from '../src/platform/staleness.js';

const REGULAR_TS = '2026-07-02T15:00:00.000Z';
const PRE_MARKET_TS = '2026-07-02T12:00:00.000Z';
const POST_MARKET_TS = '2026-07-02T21:00:00.000Z';
const WEEKEND_TS = '2026-07-04T15:00:00.000Z';

function makeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id: '2026-07-02-nvda-intraday',
    schema_version: 1,
    type: 'intraday',
    title: 'NVDA 短线多周期',
    symbol: 'NVDA.US',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    input: { symbol: 'NVDA.US', prediction: { direction: 'long' } },
    built: { kind: 'intraday' } as unknown as ChartDoc['built'],
    prediction_updated_at: '2026-07-02T14:44:00.000Z',
    ...overrides,
  };
}

describe('predictionStale', () => {
  it('is not stale within 15 minutes during regular hours', () => {
    const doc = makeDoc({ prediction_updated_at: '2026-07-02T14:50:00.000Z' });
    expect(predictionStale(doc, new Date(REGULAR_TS))).toBe(false);
  });

  it('is not stale at exactly 15 minutes (boundary, strictly greater required)', () => {
    const now = new Date(REGULAR_TS);
    const doc = makeDoc({
      prediction_updated_at: new Date(now.getTime() - PREDICTION_STALE_MS).toISOString(),
    });
    expect(predictionStale(doc, now)).toBe(false);
  });

  it('is stale at 15 minutes + 1 second during regular hours', () => {
    const now = new Date(REGULAR_TS);
    const doc = makeDoc({
      prediction_updated_at: new Date(now.getTime() - PREDICTION_STALE_MS - 1000).toISOString(),
    });
    expect(predictionStale(doc, now)).toBe(true);
  });

  it('is not stale during pre-market even when old', () => {
    const now = new Date(PRE_MARKET_TS);
    const doc = makeDoc({
      prediction_updated_at: new Date(now.getTime() - PREDICTION_STALE_MS - 1000).toISOString(),
    });
    expect(predictionStale(doc, now)).toBe(false);
  });

  it('is not stale during post-market even when old', () => {
    const now = new Date(POST_MARKET_TS);
    const doc = makeDoc({
      prediction_updated_at: new Date(now.getTime() - PREDICTION_STALE_MS - 1000).toISOString(),
    });
    expect(predictionStale(doc, now)).toBe(false);
  });

  it('is not stale on weekends even when old', () => {
    const now = new Date(WEEKEND_TS);
    const doc = makeDoc({
      prediction_updated_at: new Date(now.getTime() - PREDICTION_STALE_MS - 1000).toISOString(),
    });
    expect(predictionStale(doc, now)).toBe(false);
  });

  it('is not stale when prediction_updated_at is missing', () => {
    const doc = makeDoc({ prediction_updated_at: undefined });
    expect(predictionStale(doc, new Date(REGULAR_TS))).toBe(false);
  });

  it('is not stale when input.prediction is null', () => {
    const now = new Date(REGULAR_TS);
    const doc = makeDoc({
      input: { symbol: 'NVDA.US', prediction: null },
      prediction_updated_at: new Date(now.getTime() - PREDICTION_STALE_MS - 1000).toISOString(),
    });
    expect(predictionStale(doc, now)).toBe(false);
  });

  it('is not stale for non-intraday chart types', () => {
    const now = new Date(REGULAR_TS);
    const doc = makeDoc({
      type: 'sepa',
      prediction_updated_at: new Date(now.getTime() - PREDICTION_STALE_MS - 1000).toISOString(),
    });
    expect(predictionStale(doc, now)).toBe(false);
  });

  it("is stale when a context-only doc's generated_at is older than 15 minutes during regular hours", () => {
    const now = new Date(REGULAR_TS);
    const doc = makeDoc({
      input: {
        symbol: 'NVDA.US',
        prediction: null,
        context: {
          generated_at: new Date(now.getTime() - PREDICTION_STALE_MS - 1000).toISOString(),
        },
      },
      prediction_updated_at: undefined,
    });
    expect(predictionStale(doc, now)).toBe(true);
  });

  it("is not stale when a context-only doc's generated_at is fresh during regular hours", () => {
    const now = new Date(REGULAR_TS);
    const doc = makeDoc({
      input: {
        symbol: 'NVDA.US',
        prediction: null,
        context: { generated_at: new Date(now.getTime() - 5 * 60_000).toISOString() },
      },
      prediction_updated_at: undefined,
    });
    expect(predictionStale(doc, now)).toBe(false);
  });

  it('is not stale for an old context outside regular hours', () => {
    const now = new Date(PRE_MARKET_TS);
    const doc = makeDoc({
      input: {
        symbol: 'NVDA.US',
        prediction: null,
        context: {
          generated_at: new Date(now.getTime() - PREDICTION_STALE_MS - 1000).toISOString(),
        },
      },
      prediction_updated_at: undefined,
    });
    expect(predictionStale(doc, now)).toBe(false);
  });

  it('is not stale when doc.input.context is absent', () => {
    const now = new Date(REGULAR_TS);
    const doc = makeDoc({
      input: { symbol: 'NVDA.US', prediction: null },
      prediction_updated_at: undefined,
    });
    expect(predictionStale(doc, now)).toBe(false);
  });
});

function makeSepaDoc(asOf: string, overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id: '2026-07-17-mu-sepa',
    schema_version: 2,
    type: 'sepa',
    title: 'MU SEPA Dashboard',
    symbol: 'MU.US',
    created_at: '2026-07-17T20:00:00.000Z',
    updated_at: '2026-07-17T20:00:00.000Z',
    input: { symbol: 'MU.US' },
    built: { kind: 'sepa', sidebar: { asOf } } as unknown as ChartDoc['built'],
    ...overrides,
  };
}

describe('sepaStale', () => {
  it('is stale when the last daily bar is from before today (a weekday)', () => {
    const doc = makeSepaDoc('2026-07-22');
    expect(sepaStale(doc, new Date('2026-07-23T18:00:00.000Z'))).toBe(true);
  });

  it('is not stale when the last daily bar matches the latest trading day', () => {
    const doc = makeSepaDoc('2026-07-23');
    expect(sepaStale(doc, new Date('2026-07-23T18:00:00.000Z'))).toBe(false);
  });

  it('is not stale on Saturday when the last bar is Friday (no newer trading day yet)', () => {
    const doc = makeSepaDoc('2026-07-17');
    expect(sepaStale(doc, new Date('2026-07-18T18:00:00.000Z'))).toBe(false);
  });

  it('is not stale on Sunday when the last bar is Friday', () => {
    const doc = makeSepaDoc('2026-07-17');
    expect(sepaStale(doc, new Date('2026-07-19T18:00:00.000Z'))).toBe(false);
  });

  it('is stale on Monday when the last bar is still Friday', () => {
    const doc = makeSepaDoc('2026-07-17');
    expect(sepaStale(doc, new Date('2026-07-20T18:00:00.000Z'))).toBe(true);
  });

  it('is never stale for non-sepa chart types', () => {
    const doc = makeSepaDoc('2026-07-01', { type: 'intraday' });
    expect(sepaStale(doc, new Date('2026-07-23T18:00:00.000Z'))).toBe(false);
  });

  it('is not stale when the doc has no symbol', () => {
    const doc = makeSepaDoc('2026-07-01', { symbol: null });
    expect(sepaStale(doc, new Date('2026-07-23T18:00:00.000Z'))).toBe(false);
  });
});
