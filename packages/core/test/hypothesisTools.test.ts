import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHypothesisTools } from '../src/ai/agents/agentTools/hypothesisTools.js';
import { getHypothesis, listHypotheses } from '../src/journal/hypotheses.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyp-tools-test-'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function tool(name: string, symbol?: string) {
  const tools = buildHypothesisTools({ symbol, dir });
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function text(result: { content: unknown[] }): string {
  return (result.content[0] as { text?: string } | undefined)?.text ?? '';
}

describe('hypothesis agent tools', () => {
  it('register_hypothesis creates an active hypothesis, defaulting the bound symbol', async () => {
    const result = await tool('register_hypothesis', 'MU.US').execute('c1', {
      thesis: 'HBM 供给短缺贯穿全年',
      invalidation_notes: ['合约价环比转跌'],
    });
    const payload = JSON.parse(text(result)) as { id: string; status: string };
    expect(payload.status).toBe('active');

    const stored = await getHypothesis(payload.id, dir);
    expect(stored?.symbol).toBe('MU.US');
    expect(stored?.thesis).toBe('HBM 供给短缺贯穿全年');
  });

  it('register_hypothesis rejects missing invalidation notes instead of throwing', async () => {
    const result = await tool('register_hypothesis').execute('c1', {
      thesis: '论点',
      invalidation_notes: ['   '],
    });
    expect(text(result)).toContain('rejected');
    expect(await listHypotheses(dir)).toHaveLength(0);
  });

  it('list_hypotheses returns active entries only', async () => {
    await tool('register_hypothesis', 'MU.US').execute('c1', {
      thesis: '甲',
      invalidation_notes: ['a'],
    });
    const listed = JSON.parse(text(await tool('list_hypotheses').execute('c2', {}))) as {
      id: string;
      thesis: string;
    }[];
    expect(listed).toHaveLength(1);
    expect(listed[0].thesis).toBe('甲');
  });
});
