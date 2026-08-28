import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EVENT_LIST_LIMIT,
  MAX_EVENT_LIST_LIMIT,
  normalizeEventListInput,
} from '../src/events/eventListInput.js';
import { ClientError } from '../src/platform/errors.js';

describe('normalizeEventListInput', () => {
  it('falls back to the default limit when nothing was asked for', () => {
    expect(normalizeEventListInput()).toEqual({ limit: DEFAULT_EVENT_LIST_LIMIT });
  });

  it('treats an empty query param as absent rather than as a filter', () => {
    expect(
      normalizeEventListInput({ symbol: '', source: '', class: '', since: '', before: '' }),
    ).toEqual({ limit: DEFAULT_EVENT_LIST_LIMIT });
  });

  it('normalizes a bare ticker into its qualified form', () => {
    expect(normalizeEventListInput({ symbol: 'mu' }).symbol).toBe('MU.US');
  });

  it('rejects a symbol carrying a LIKE wildcard instead of matching everything', () => {
    expect(() => normalizeEventListInput({ symbol: '%' })).toThrow(ClientError);
    expect(() => normalizeEventListInput({ symbol: '_VDA.US' })).toThrow(ClientError);
  });

  it('trims the source', () => {
    expect(normalizeEventListInput({ source: ' sec-edgar ' }).source).toBe('sec-edgar');
  });

  it('accepts a known class and rejects an unknown one', () => {
    expect(normalizeEventListInput({ class: 'macro' }).class).toBe('macro');
    expect(() => normalizeEventListInput({ class: 'nonsense' })).toThrow(ClientError);
  });

  it('accepts a limit that arrived as an HTTP query string', () => {
    expect(normalizeEventListInput({ limit: '25' }).limit).toBe(25);
  });

  it('rejects a limit that is not a positive integer', () => {
    for (const limit of ['many', '0', '-1', '1.5', Number.NaN, 0, -3]) {
      expect(() => normalizeEventListInput({ limit })).toThrow(ClientError);
    }
  });

  it('rejects a limit above the maximum instead of loading the whole table', () => {
    expect(normalizeEventListInput({ limit: MAX_EVENT_LIST_LIMIT }).limit).toBe(
      MAX_EVENT_LIST_LIMIT,
    );
    expect(() => normalizeEventListInput({ limit: MAX_EVENT_LIST_LIMIT + 1 })).toThrow(ClientError);
  });

  it('canonicalizes since and before to ISO instants', () => {
    expect(normalizeEventListInput({ since: '2026-08-20T13:00:00Z' }).since).toBe(
      '2026-08-20T13:00:00.000Z',
    );
    expect(normalizeEventListInput({ before: '2026-08-20T21:00:00+08:00' }).before).toBe(
      '2026-08-20T13:00:00.000Z',
    );
  });

  it('rejects a since or before that is not a valid ISO instant', () => {
    for (const value of ['yesterday', '2026-08-20', '2026-13-01T00:00:00Z', '13:00']) {
      expect(() => normalizeEventListInput({ since: value })).toThrow(ClientError);
      expect(() => normalizeEventListInput({ before: value })).toThrow(ClientError);
    }
  });

  it('rejects a beforeId with no before to anchor it', () => {
    expect(() => normalizeEventListInput({ beforeId: 'abc' })).toThrow(ClientError);
  });

  it('keeps beforeId as the tie-breaker for the before cursor', () => {
    expect(
      normalizeEventListInput({ before: '2026-08-20T13:00:00.000Z', beforeId: 'abc' }),
    ).toMatchObject({ before: '2026-08-20T13:00:00.000Z', beforeId: 'abc' });
  });

  it('rejects a non-string filter value', () => {
    expect(() => normalizeEventListInput({ symbol: 42 })).toThrow(ClientError);
    expect(() => normalizeEventListInput({ source: {} })).toThrow(ClientError);
  });
});
