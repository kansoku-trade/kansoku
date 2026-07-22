import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendRunCard,
  createHypothesis,
  getHypothesis,
  listHypotheses,
  updateHypothesisStatus,
} from '../src/journal/hypotheses.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hypotheses-test-'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('hypotheses registry', () => {
  it('creates an active hypothesis and reads it back', async () => {
    const created = await createHypothesis(
      { thesis: 'HBM 供给短缺贯穿全年', symbol: 'MU.US', invalidation_notes: ['合约价环比转跌'] },
      dir,
    );
    expect(created.status).toBe('active');
    expect(created.id).toBeTruthy();

    const loaded = await getHypothesis(created.id, dir);
    expect(loaded?.thesis).toBe('HBM 供给短缺贯穿全年');
    expect(loaded?.invalidation_notes).toEqual(['合约价环比转跌']);
    expect(loaded?.run_cards).toEqual([]);
  });

  it('rejects a hypothesis without a thesis or without invalidation notes', async () => {
    await expect(
      createHypothesis({ thesis: '  ', invalidation_notes: ['x'] }, dir),
    ).rejects.toThrow();
    await expect(
      createHypothesis({ thesis: '论点', invalidation_notes: [] }, dir),
    ).rejects.toThrow();
    await expect(
      createHypothesis({ thesis: '论点', invalidation_notes: ['   '] }, dir),
    ).rejects.toThrow();
  });

  it('appends run cards and bumps updatedAt', async () => {
    const created = await createHypothesis(
      { thesis: '论点', invalidation_notes: ['证伪条件'] },
      dir,
    );
    const updated = await appendRunCard(
      created.id,
      { kind: 'prediction', ref: 'chart-1', summary: '短线看多，共振 63%', outcome: 'open' },
      dir,
    );
    expect(updated.run_cards).toHaveLength(1);
    expect(updated.run_cards[0].kind).toBe('prediction');
    expect(updated.run_cards[0].at).toBeTruthy();
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
  });

  it('transitions status only away from active', async () => {
    const created = await createHypothesis(
      { thesis: '论点', invalidation_notes: ['证伪条件'] },
      dir,
    );
    const invalidated = await updateHypothesisStatus(created.id, 'invalidated', dir);
    expect(invalidated.status).toBe('invalidated');
    await expect(updateHypothesisStatus(created.id, 'confirmed', dir)).rejects.toThrow();
  });

  it('lists hypotheses newest-updated first', async () => {
    const first = await createHypothesis({ thesis: '一', invalidation_notes: ['a'] }, dir);
    const second = await createHypothesis({ thesis: '二', invalidation_notes: ['b'] }, dir);
    await appendRunCard(first.id, { kind: 'note', summary: '补充' }, dir);
    const list = await listHypotheses(dir);
    expect(list.map((h) => h.thesis)).toEqual(['一', '二']);
    expect(list).toHaveLength(2);
    expect(second.id).not.toBe(first.id);
  });
});
