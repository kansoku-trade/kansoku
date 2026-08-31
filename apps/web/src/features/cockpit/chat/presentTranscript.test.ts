import { describe, expect, it } from 'vitest';
import type { ChatRow } from './useChatSession';
import {
  formatWorkedDuration,
  presentTranscript,
  type TranscriptBlock,
} from './presentTranscript.js';

const ts = (clock: string) => `2026-08-31T${clock}.000Z`;

function user(id: string, clock: string, text: string): ChatRow {
  return { id, ts: ts(clock), kind: 'user', text };
}

function assistant(id: string, clock: string, text: string): ChatRow {
  return { id, ts: ts(clock), kind: 'assistant', text };
}

function tool(
  id: string,
  clock: string,
  label: string,
  input?: Record<string, unknown>,
  output?: string,
): ChatRow {
  return {
    id,
    ts: ts(clock),
    kind: 'tool',
    label,
    input: input ? JSON.stringify(input) : undefined,
    output,
  };
}

function saveCanvas(id: string, clock: string, slug: string, title: string): ChatRow {
  return tool(
    id,
    clock,
    'save_canvas',
    { slug, title, source: 'x' },
    `saved slug=${slug} title=${title}`,
  );
}

function summarize(blocks: TranscriptBlock[]): string[] {
  return blocks.map((block) => {
    switch (block.type) {
      case 'user': {
        return `user:${block.row.text}`;
      }
      case 'assistant': {
        return `text:${block.row.text}${block.streaming ? ':stream' : ''}`;
      }
      case 'tool': {
        return `tool:${block.tool.label}${block.tool.running ? ':run' : ''}`;
      }
      case 'tool-group': {
        return `group:${block.tools.length}:${block.running ? 'run' : 'done'}:${block.titles.join(',')}`;
      }
      case 'worked': {
        return `worked:${block.durationMs}:${summarize(block.blocks).join('|')}`;
      }
      case 'canvases': {
        return `canvases:${block.entries.map((entry) => entry.slug).join(',')}`;
      }
      case 'thinking': {
        return 'thinking';
      }
      case 'error': {
        return `error:${block.row.text}`;
      }
      case 'insert': {
        return `insert:${block.insert.id}`;
      }
    }
  });
}

describe('formatWorkedDuration', () => {
  it('names sub-second turns as under one second', () => {
    expect(formatWorkedDuration(0)).toBe('跑了不到 1 秒');
    expect(formatWorkedDuration(400)).toBe('跑了不到 1 秒');
  });

  it('uses seconds below one minute', () => {
    expect(formatWorkedDuration(12_000)).toBe('跑了 12 秒');
    expect(formatWorkedDuration(59_000)).toBe('跑了 59 秒');
  });

  it('uses minutes and leftover seconds', () => {
    expect(formatWorkedDuration(60_000)).toBe('跑了 1 分');
    expect(formatWorkedDuration(72_000)).toBe('跑了 1 分 12 秒');
  });

  it('uses hours when the turn crosses 60 minutes', () => {
    expect(formatWorkedDuration(3_600_000)).toBe('跑了 1 小时');
    expect(formatWorkedDuration(3_780_000)).toBe('跑了 1 小时 3 分');
  });
});

describe('presentTranscript', () => {
  it('leaves a no-tool turn unfolded', () => {
    const blocks = presentTranscript({
      rows: [user('u1', '10:00:00', '怎么看 MU'), assistant('a1', '10:00:08', '先看开盘')],
    });
    expect(summarize(blocks)).toEqual(['user:怎么看 MU', 'text:先看开盘']);
  });

  it('folds process above the last text into one worked block', () => {
    const blocks = presentTranscript({
      rows: [
        user('u1', '10:00:00', '拉三只'),
        assistant('a1', '10:01:12', '先读流程'),
        tool('t1', '10:01:12', 'read_skill', { name: 'canvas' }),
        tool('t2', '10:01:12', 'bash', { command: 'longbridge kline MRVL.US --period day --count 20' }),
        tool('t3', '10:01:12', 'bash', { command: 'longbridge kline DRAM.US --period day --count 20' }),
        assistant('a2', '10:01:12', 'MRVL 最强'),
      ],
    });
    expect(summarize(blocks)).toEqual([
      'user:拉三只',
      'worked:72000:text:先读流程|group:3:done:加载分析流程,执行数据命令',
      'text:MRVL 最强',
    ]);
  });

  it('keeps a lone tool as a single row inside the fold', () => {
    const blocks = presentTranscript({
      rows: [
        user('u1', '10:00:00', '保存'),
        tool('t1', '10:00:05', 'read_file', { path: 'stocks/MU.md' }),
        assistant('a1', '10:00:05', '看完了'),
      ],
    });
    expect(summarize(blocks)).toEqual(['user:保存', 'worked:5000:tool:read_file', 'text:看完了']);
  });

  it('splits tool groups when text sits between them', () => {
    const blocks = presentTranscript({
      rows: [
        user('u1', '10:00:00', '对照'),
        tool('t1', '10:00:20', 'read_skill', { name: 'canvas' }),
        tool('t2', '10:00:20', 'read_skill', { name: 'yfinance-data' }),
        assistant('a1', '10:00:20', '三只都齐了'),
        saveCanvas('t3', '10:00:20', 'e2e-three-layer', '三层强弱对照'),
        assistant('a2', '10:00:20', 'MRVL 最强'),
      ],
    });
    expect(summarize(blocks)).toEqual([
      'user:对照',
      'worked:20000:group:2:done:加载分析流程|text:三只都齐了|tool:save_canvas',
      'text:MRVL 最强',
      'canvases:e2e-three-layer',
    ]);
  });

  it('still folds when the turn ends on a tool and surfaces canvases', () => {
    const blocks = presentTranscript({
      rows: [
        user('u1', '10:00:00', '画一张'),
        tool('t1', '10:00:09', 'read_skill', { name: 'canvas' }),
        saveCanvas('t2', '10:00:09', 'mu-panel', 'MU 读数'),
      ],
    });
    expect(summarize(blocks)).toEqual([
      'user:画一张',
      'worked:9000:group:2:done:加载分析流程,保存画布',
      'canvases:mu-panel',
    ]);
  });

  it('does not emit a worked bar when there are no tools', () => {
    const blocks = presentTranscript({
      rows: [
        user('u1', '10:00:00', '问'),
        assistant('a1', '10:00:03', '先说一句'),
        assistant('a2', '10:00:03', '再给结论'),
      ],
    });
    expect(summarize(blocks)).toEqual(['user:问', 'text:先说一句', 'text:再给结论']);
  });

  it('folds each completed turn on its own', () => {
    const blocks = presentTranscript({
      rows: [
        user('u1', '10:00:00', '第一问'),
        tool('t1', '10:00:04', 'read_file', { path: 'a.md' }),
        assistant('a1', '10:00:04', '答一'),
        user('u2', '10:02:00', '第二问'),
        tool('t2', '10:02:10', 'read_file', { path: 'b.md' }),
        assistant('a2', '10:02:10', '答二'),
      ],
    });
    expect(summarize(blocks)).toEqual([
      'user:第一问',
      'worked:4000:tool:read_file',
      'text:答一',
      'user:第二问',
      'worked:10000:tool:read_file',
      'text:答二',
    ]);
  });

  it('keeps errors visible outside the fold', () => {
    const blocks = presentTranscript({
      rows: [
        user('u1', '10:00:00', '问'),
        tool('t1', '10:00:03', 'bash', { command: 'true' }),
        assistant('a1', '10:00:03', '结论'),
        { id: 'e1', ts: ts('10:00:03'), kind: 'error', text: '模型超时' },
      ],
    });
    expect(summarize(blocks)).toEqual([
      'user:问',
      'worked:3000:tool:bash',
      'text:结论',
      'error:模型超时',
    ]);
  });

  it('does not fold the live turn', () => {
    const blocks = presentTranscript({
      busy: true,
      rows: [user('u1', '10:00:00', '拉三只')],
      liveBeats: [
        { kind: 'text', text: '先读流程' },
        {
          kind: 'tool',
          tool: {
            id: 'lt1',
            label: 'read_skill',
            status: 'end',
            input: JSON.stringify({ name: 'canvas' }),
          },
        },
        {
          kind: 'tool',
          tool: {
            id: 'lt2',
            label: 'bash',
            status: 'end',
            input: JSON.stringify({ command: 'longbridge kline MRVL.US --period day --count 20' }),
          },
        },
        {
          kind: 'tool',
          tool: {
            id: 'lt3',
            label: 'bash',
            status: 'start',
            input: JSON.stringify({ command: 'longbridge kline SMH.US --period day --count 20' }),
          },
        },
      ],
    });
    expect(summarize(blocks)).toEqual([
      'user:拉三只',
      'text:先读流程',
      'group:3:run:加载分析流程,执行数据命令',
    ]);
  });

  it('shows thinking when the live turn is idle between tools and text', () => {
    const blocks = presentTranscript({
      busy: true,
      rows: [user('u1', '10:00:00', '问')],
    });
    expect(summarize(blocks)).toEqual(['user:问', 'thinking']);
  });

  it('surfaces a live canvas after the current beats', () => {
    const blocks = presentTranscript({
      busy: true,
      rows: [user('u1', '10:00:00', '画')],
      liveBeats: [
        {
          kind: 'tool',
          tool: {
            id: 'lt1',
            label: 'save_canvas',
            status: 'end',
            input: JSON.stringify({ slug: 'mu-panel', title: 'MU 读数' }),
            output: 'saved slug=mu-panel title=MU 读数',
          },
        },
        { kind: 'text', text: '画布写好了' },
      ],
    });
    expect(summarize(blocks)).toEqual([
      'user:画',
      'tool:save_canvas',
      'text:画布写好了:stream',
      'canvases:mu-panel',
    ]);
  });
});
