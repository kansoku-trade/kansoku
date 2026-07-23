import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiAgentFactory, AiAgentHandle } from '../src/ai/agents/agentSession.js';
import type { ReassessPack } from '../src/ai/agents/datapack.js';
import { runAnalyst } from '../src/ai/personas/analyst/run.js';
import {
  analystRunStatus,
  appendAnalystActivity,
  onAnalystRunChange,
  setAnalystSection,
} from '../src/ai/personas/analyst/runState.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;
const FAKE_SKILL = '# intraday-signal\n假技能全文。';
const FAKE_DISCIPLINE = '# trading-discipline\n假纪律全文。';

function makePack(): ReassessPack {
  return {
    symbol: 'MU.US',
    as_of: '2026-07-05T15:00:00.000Z',
    timeframes: {} as ReassessPack['timeframes'],
    flow: [],
    rel_volume: null,
    day_levels: null,
    day_context: null,
    options_levels: null,
    event_risk: null,
    lessons: [],
    market: { spy: null, qqq: null },
    news: [],
    prediction: null,
    prediction_chart_id: null,
    position: null,
  };
}

function startHangingRun(symbol: string): { release: () => void; done: Promise<void> } {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sandbox = mkdtempSync(join(tmpdir(), 'analyst-runstate-test-'));
  const agentFactory: AiAgentFactory = () => {
    const agent: AiAgentHandle = {
      prompt: () => wait,
      abort: () => {},
    };
    return agent;
  };
  const run = runAnalyst({
    symbol,
    origin: 'manual',
    deps: {
      model: fakeModel,
      agentFactory,
      buildReassessPack: async () => makePack(),
      appendComment: async () => {},
      repoRoot: sandbox,
      journalDir: join(sandbox, 'journal'),
      skillText: FAKE_SKILL,
      disciplineText: FAKE_DISCIPLINE,
    },
  });
  if (!run.started) throw new Error('expected run to start');
  return { release, done: run.done };
}

describe('analyst run state — activities and sections', () => {
  it('appends activities in order and caps at the most recent 50', async () => {
    const symbol = 'ACTIVITY-CAP.US';
    const { release, done } = startHangingRun(symbol);
    let tick = 0;
    const now = () => Date.parse('2026-07-20T00:00:00.000Z') + tick++ * 1000;

    for (let i = 0; i < 55; i++) {
      appendAnalystActivity(symbol, `step-${i}`, now);
    }

    const status = analystRunStatus(symbol);
    if (!status.running) throw new Error('expected running status');
    expect(status.activities).toHaveLength(50);
    expect(status.activities?.[0].text).toBe('step-5');
    expect(status.activities?.[49].text).toBe('step-54');

    release();
    await done;
  });

  it('broadcasts exactly one change event per call', async () => {
    const symbol = 'ACTIVITY-BROADCAST.US';
    const { release, done } = startHangingRun(symbol);
    const now = () => Date.parse('2026-07-20T00:00:00.000Z');

    let calls = 0;
    const unsubscribe = onAnalystRunChange(() => {
      calls += 1;
    });

    appendAnalystActivity(symbol, 'first activity', now);
    expect(calls).toBe(1);

    setAnalystSection(symbol, { kind: 'technical', data: { trends: [], levels: [], summary: 's' } }, now);
    expect(calls).toBe(2);

    unsubscribe();
    release();
    await done;
  });

  it('accumulates technical and context sections; re-submitting overwrites that section only', async () => {
    const symbol = 'SECTIONS-ACCUMULATE.US';
    const { release, done } = startHangingRun(symbol);
    const now = () => Date.parse('2026-07-20T00:00:00.000Z');

    setAnalystSection(
      symbol,
      {
        kind: 'technical',
        data: { trends: [{ timeframe: 'h1', trend: 'up' }], levels: [], summary: '第一次技术面' },
      },
      now,
    );
    setAnalystSection(
      symbol,
      { kind: 'context', data: { summary: '宏观偏多', bias: 'bullish' } },
      now,
    );

    let status = analystRunStatus(symbol);
    if (!status.running) throw new Error('expected running status');
    expect(status.sections?.technical?.summary).toBe('第一次技术面');
    expect(status.sections?.context?.summary).toBe('宏观偏多');

    setAnalystSection(
      symbol,
      { kind: 'technical', data: { trends: [{ timeframe: 'day', trend: 'down' }], levels: [], summary: '修正后的技术面' } },
      now,
    );

    status = analystRunStatus(symbol);
    if (!status.running) throw new Error('expected running status');
    expect(status.sections?.technical?.summary).toBe('修正后的技术面');
    expect(status.sections?.context?.summary).toBe('宏观偏多');

    release();
    await done;
  });

  it('is a silent no-op for both setters when no run is active', () => {
    const symbol = 'NO-RUN.US';
    const now = () => Date.parse('2026-07-20T00:00:00.000Z');

    let calls = 0;
    const unsubscribe = onAnalystRunChange(() => {
      calls += 1;
    });

    expect(() => appendAnalystActivity(symbol, 'ignored', now)).not.toThrow();
    expect(() => {
      setAnalystSection(symbol, { kind: 'context', data: { summary: 'x', bias: 'neutral' } }, now);
    }).not.toThrow();

    expect(calls).toBe(0);
    expect(analystRunStatus(symbol)).toEqual({ running: false });
    unsubscribe();
  });

  it('does not leak sections/activities from a finished run into the next run on the same symbol', async () => {
    const symbol = 'NO-LEAK.US';
    const now = () => Date.parse('2026-07-20T00:00:00.000Z');

    const first = startHangingRun(symbol);
    appendAnalystActivity(symbol, 'from first run', now);
    setAnalystSection(symbol, { kind: 'context', data: { summary: '第一轮', bias: 'neutral' } }, now);
    first.release();
    await first.done;

    expect(analystRunStatus(symbol)).toEqual({ running: false });

    const second = startHangingRun(symbol);
    const status = analystRunStatus(symbol);
    if (!status.running) throw new Error('expected running status');
    expect(status.activities).toEqual([]);
    expect(status.sections).toEqual({});

    second.release();
    await second.done;
  });
});
