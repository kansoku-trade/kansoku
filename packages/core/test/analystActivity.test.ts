import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, AgentTool } from '@earendil-works/pi-agent-core';
import { describe, expect, it } from 'vitest';
import { describeToolCall, describeTurnStart } from '../src/ai/personas/analyst/activity.js';
import type { AiAgentFactory, AiAgentHandle } from '../src/ai/agents/agentSession.js';
import type { ReassessPack } from '../src/ai/agents/datapack.js';
import { runAnalyst } from '../src/ai/personas/analyst/run.js';
import { analystRunStatus } from '../src/ai/personas/analyst/runState.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;
const FAKE_SKILL = '# intraday-signal\n假技能全文。';
const FAKE_DISCIPLINE = '# trading-discipline\n假纪律全文。';

const validPrediction = {
  direction: 'long' as const,
  anchor: { timeframe: 'm5' as const, time: '2026-07-05T15:00:00Z', price: 100 },
  entry_plan: { entry: 100, stop: 97, target1: 104, target2: 108 },
  scenarios: [
    { label: '上破', probability: 50 },
    { label: '震荡', probability: 30 },
    { label: '下破', probability: 20 },
  ],
  comment: '多头结构完好，站上 100 看 104。',
};

function findTool(tools: AgentTool[], name: string): AgentTool {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

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

describe('describeToolCall', () => {
  it('maps fixed-string tools exactly', () => {
    expect(describeToolCall('read_data_pack', {})).toBe('正在读取数据包');
    expect(describeToolCall('fetch_news', {})).toBe('正在查最新新闻');
    expect(describeToolCall('append_comment', {})).toBe('正在记录阶段点评');
    expect(describeToolCall('write_journal', {})).toBe('正在写观察日志');
    expect(describeToolCall('submit_prediction', {})).toBe('正在提交预测');
    expect(describeToolCall('submit_section', {})).toBe('正在提交中间读数');
  });

  it('maps every fetch_kline period variant', () => {
    expect(describeToolCall('fetch_kline', { period: 'm5' })).toBe('正在读 5 分钟 K 线');
    expect(describeToolCall('fetch_kline', { period: 'm15' })).toBe('正在读 15 分钟 K 线');
    expect(describeToolCall('fetch_kline', { period: 'h1' })).toBe('正在读 1 小时 K 线');
    expect(describeToolCall('fetch_kline', { period: 'day' })).toBe('正在读日 K 线');
  });

  it('falls back to a bare K-line message for an unknown or missing period', () => {
    expect(describeToolCall('fetch_kline', { period: 'w1' })).toBe('正在读 K 线');
    expect(describeToolCall('fetch_kline', {})).toBe('正在读 K 线');
    expect(describeToolCall('fetch_kline', undefined)).toBe('正在读 K 线');
  });

  it('summarizes research-family tool args, truncated to 40 characters', () => {
    expect(describeToolCall('bash', { command: 'longbridge quote SPY.US' })).toBe(
      '正在检索资料：longbridge quote SPY.US',
    );
    expect(describeToolCall('read_file', { path: 'stocks/MU.md' })).toBe('正在检索资料：stocks/MU.md');
    expect(describeToolCall('grep', { pattern: 'TD-TREND-01' })).toBe('正在检索资料：TD-TREND-01');
    expect(describeToolCall('read_skill', { name: 'intraday-signal' })).toBe('正在检索资料：intraday-signal');

    const longCommand = 'x'.repeat(60);
    expect(describeToolCall('bash', { command: longCommand })).toBe(
      `正在检索资料：${'x'.repeat(40)}`,
    );
  });

  it('falls back to a bare research message when no arg is summarizable', () => {
    expect(describeToolCall('list_files', {})).toBe('正在检索资料');
    expect(describeToolCall('grep', { pattern: '' })).toBe('正在检索资料');
    expect(describeToolCall('bash', { command: '   ' })).toBe('正在检索资料');
  });

  it('never throws on malformed args and degrades to the safe fallback', () => {
    expect(() => describeToolCall('fetch_kline', undefined)).not.toThrow();
    expect(() => describeToolCall('fetch_kline', null)).not.toThrow();
    expect(() => describeToolCall('fetch_kline', 42)).not.toThrow();
    expect(() => describeToolCall('bash', null)).not.toThrow();
    expect(() => describeToolCall('bash', 'oops')).not.toThrow();
    expect(() => describeToolCall('bash', ['oops'])).not.toThrow();
    expect(describeToolCall('bash', null)).toBe('正在检索资料');
    expect(describeToolCall('bash', 42)).toBe('正在检索资料');
  });

  it('falls back to a generic call description for unknown tools', () => {
    expect(describeToolCall('some_future_tool', { a: 1 })).toBe('正在调用 some_future_tool');
    expect(describeToolCall('some_future_tool', undefined)).toBe('正在调用 some_future_tool');
  });
});

describe('describeTurnStart', () => {
  it('numbers reasoning turns starting at 1', () => {
    expect(describeTurnStart(1)).toBe('第 1 轮推理中');
    expect(describeTurnStart(2)).toBe('第 2 轮推理中');
    expect(describeTurnStart(12)).toBe('第 12 轮推理中');
  });
});

describe('analyst activity wiring', () => {
  it('appends turn and tool-call activities from agent events, in order', async () => {
    const symbol = 'ACTIVITY-WIRE.US';
    const sandbox = mkdtempSync(join(tmpdir(), 'analyst-activity-test-'));
    let captured: string[] = [];

    const events: AgentEvent[] = [
      { type: 'turn_start' },
      { type: 'tool_execution_start', toolCallId: '1', toolName: 'read_data_pack', args: {} },
      {
        type: 'tool_execution_start',
        toolCallId: '2',
        toolName: 'fetch_kline',
        args: { period: 'm5' },
      },
      { type: 'turn_start' },
      {
        type: 'tool_execution_start',
        toolCallId: '3',
        toolName: 'read_skill',
        args: { name: 'intraday-signal' },
      },
      { type: 'tool_execution_start', toolCallId: '4', toolName: 'submit_prediction', args: {} },
    ];

    const agentFactory: AiAgentFactory = ({ tools }) => {
      let listeners: Array<(event: AgentEvent) => void> = [];
      const agent: AiAgentHandle = {
        prompt: async () => {
          for (const event of events) {
            for (const listener of listeners) listener(event);
          }
          await findTool(tools, 'submit_prediction').execute('c1', validPrediction);
          captured =
            analystRunStatus(symbol).running === true
              ? (analystRunStatus(symbol) as { activities?: { text: string }[] }).activities?.map(
                  (a) => a.text,
                ) ?? []
              : [];
        },
        abort: () => {},
        subscribe: (listener) => {
          listeners.push(listener);
          return () => {
            listeners = listeners.filter((l) => l !== listener);
          };
        },
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
        createChart: async () => ({ id: 'chart-new', url: 'http://localhost/#/charts/chart-new' }),
        repoRoot: sandbox,
        journalDir: join(sandbox, 'journal'),
        skillText: FAKE_SKILL,
        disciplineText: FAKE_DISCIPLINE,
      },
    });
    if (!run.started) throw new Error('expected run to start');
    await run.done;

    expect(captured).toEqual([
      '第 1 轮推理中',
      '正在读取数据包',
      '正在读 5 分钟 K 线',
      '第 2 轮推理中',
      '正在检索资料：intraday-signal',
      '正在提交预测',
    ]);
  });

  it('a throwing onEvent handler never kills the run', async () => {
    const symbol = 'ACTIVITY-THROW.US';
    const sandbox = mkdtempSync(join(tmpdir(), 'analyst-activity-throw-test-'));

    const agentFactory: AiAgentFactory = () => {
      let listeners: Array<(event: AgentEvent) => void> = [];
      const agent: AiAgentHandle = {
        prompt: async () => {
          for (const listener of listeners) {
            listener({
              type: 'tool_execution_start',
              toolCallId: '1',
              toolName: 'fetch_kline',
              args: Symbol('boom'),
            });
          }
        },
        abort: () => {},
        subscribe: (listener) => {
          listeners.push(listener);
          return () => {
            listeners = listeners.filter((l) => l !== listener);
          };
        },
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
    await expect(run.done).resolves.toBeUndefined();
  });
});
