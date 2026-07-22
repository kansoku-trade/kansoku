import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tsukiRequest } from './helpers.js';

const store = vi.hoisted(() => ({
  listHypotheses: vi.fn(),
  createHypothesis: vi.fn(),
  updateHypothesisStatus: vi.fn(),
  appendRunCard: vi.fn(),
}));

vi.mock('@kansoku/core/journal/hypotheses', () => store);

const sample = {
  id: 'h-1',
  thesis: 'HBM 供给短缺贯穿全年',
  status: 'active',
  invalidation_notes: ['合约价环比转跌'],
  run_cards: [],
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

beforeEach(() => {
  store.listHypotheses.mockReset();
  store.createHypothesis.mockReset();
  store.updateHypothesisStatus.mockReset();
  store.appendRunCard.mockReset();
});

describe('hypotheses routes', () => {
  it('lists hypotheses', async () => {
    store.listHypotheses.mockResolvedValue([sample]);
    const res = await tsukiRequest('/api/hypotheses', { method: 'GET' });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([sample]);
  });

  it('creates a hypothesis from the request body', async () => {
    store.createHypothesis.mockResolvedValue(sample);
    const res = await tsukiRequest('/api/hypotheses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thesis: 'HBM 供给短缺贯穿全年',
        symbol: 'MU.US',
        invalidation_notes: ['合约价环比转跌'],
      }),
    });
    expect(res.status).toBe(200);
    expect(store.createHypothesis).toHaveBeenCalledWith({
      thesis: 'HBM 供给短缺贯穿全年',
      symbol: 'MU.US',
      invalidation_notes: ['合约价环比转跌'],
    });
  });

  it('rejects an unknown status value', async () => {
    const res = await tsukiRequest('/api/hypotheses/h-1/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'nope' }),
    });
    expect(res.status).toBe(400);
    expect(store.updateHypothesisStatus).not.toHaveBeenCalled();
  });

  it('updates status and appends run cards', async () => {
    store.updateHypothesisStatus.mockResolvedValue({ ...sample, status: 'invalidated' });
    const statusRes = await tsukiRequest('/api/hypotheses/h-1/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'invalidated' }),
    });
    expect(statusRes.status).toBe(200);
    expect(store.updateHypothesisStatus).toHaveBeenCalledWith('h-1', 'invalidated');

    store.appendRunCard.mockResolvedValue(sample);
    const cardRes = await tsukiRequest('/api/hypotheses/h-1/run-cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'prediction', summary: '短线看多', ref: 'chart-1' }),
    });
    expect(cardRes.status).toBe(200);
    expect(store.appendRunCard).toHaveBeenCalledWith('h-1', {
      kind: 'prediction',
      summary: '短线看多',
      ref: 'chart-1',
    });
  });
});
