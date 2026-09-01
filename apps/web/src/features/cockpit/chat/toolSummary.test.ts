import { describe, expect, it } from 'vitest';
import { presentToolCall, summarizeToolInput, toolRowKey } from './toolSummary.js';

describe('summarizeToolInput', () => {
  it('returns empty string when no input', () => {
    expect(summarizeToolInput(undefined)).toBe('');
    expect(summarizeToolInput('')).toBe('');
  });

  it('takes the first line and trims it', () => {
    expect(summarizeToolInput('  ls -la  \nmore stuff')).toBe('ls -la');
  });

  it('truncates long first lines with an ellipsis', () => {
    const long = 'a'.repeat(120);
    const result = summarizeToolInput(long);
    expect(result.length).toBe(80);
    expect(result.endsWith('…')).toBe(true);
  });

  it('does not truncate a short first line', () => {
    expect(summarizeToolInput('short input')).toBe('short input');
  });
});

describe('toolRowKey', () => {
  it('combines scope and id', () => {
    expect(toolRowKey('history', 'row-1')).toBe('history:row-1');
    expect(toolRowKey('live', 'tool-2')).toBe('live:tool-2');
  });
});

describe('presentToolCall', () => {
  it('turns a Longbridge quote command into a user-facing market-data summary', () => {
    expect(
      presentToolCall(
        'bash',
        JSON.stringify({ command: 'longbridge quote DRAM.US SMH.US MU.US', cwd: '/repo' }),
      ),
    ).toEqual({
      title: '查询实时行情',
      items: ['$DRAM.US', '$SMH.US', '$MU.US'],
      meta: '3 个标的 · 长桥实时行情',
    });
  });

  it('uses the same presentation for the live Bash label', () => {
    expect(presentToolCall('Bash', JSON.stringify({ command: 'longbridge quote 700.HK' }))).toEqual(
      {
        title: '查询实时行情',
        items: ['$700.HK'],
        meta: '1 个标的 · 长桥实时行情',
      },
    );
  });

  it('summarizes structured market and document tools without exposing raw JSON', () => {
    expect(
      presentToolCall('Fetch K-line', JSON.stringify({ symbol: 'MU.US', period: 'm5', count: 80 })),
    ).toEqual({
      title: '获取 K 线',
      items: ['$MU.US'],
      meta: 'm5 · 80 根',
    });
    expect(presentToolCall('read_file', JSON.stringify({ path: 'stocks/MU.md' }))).toEqual({
      title: '读取文件',
      items: [],
      meta: 'stocks/MU.md',
    });
    expect(
      presentToolCall('save_canvas', JSON.stringify({ slug: 'mu-panel', title: 'MU 读数' })),
    ).toEqual({
      title: '保存画布',
      items: ['MU 读数'],
      meta: 'mu-panel',
    });
    expect(
      presentToolCall(
        'Edit File',
        JSON.stringify({ path: 'journal/canvases/mu-panel.canvas.tsx' }),
      ),
    ).toEqual({
      title: '修改画布文件',
      items: [],
      meta: 'journal/canvases/mu-panel.canvas.tsx',
    });
  });

  it('falls back to the command text when Bash input is not a recognized visualization', () => {
    expect(
      presentToolCall('bash', JSON.stringify({ command: 'python scripts/check.py --json' })),
    ).toEqual({
      title: '执行数据命令',
      items: [],
      meta: 'python scripts/check.py --json',
    });
  });
});
