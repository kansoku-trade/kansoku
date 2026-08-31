import { describe, expect, it } from 'vitest';
import { applyLiveBeat } from './liveBeats.js';
import type { ChatLiveBeat } from './useChatSession';

function summarize(beats: ChatLiveBeat[]): string[] {
  return beats.map((beat) => {
    if (beat.kind === 'text') return `text:${beat.text}`;
    return `tool:${beat.tool.id}:${beat.tool.label}:${beat.tool.status}`;
  });
}

describe('applyLiveBeat', () => {
  it('opens a text beat on the first delta', () => {
    expect(summarize(applyLiveBeat([], { event: 'delta', text: '先读' }, 't0'))).toEqual(['text:先读']);
  });

  it('appends a delta onto the current text beat', () => {
    const once = applyLiveBeat([], { event: 'delta', text: '先读' }, 't0');
    expect(summarize(applyLiveBeat(once, { event: 'delta', text: '流程' }, 't0'))).toEqual(['text:先读流程']);
  });

  it('starts a new text beat after a tool', () => {
    const withTool = applyLiveBeat(
      applyLiveBeat([], { event: 'delta', text: '先读流程' }, 't0'),
      { event: 'tool', label: 'bash', status: 'start', input: '{"command":"ls"}' },
      't1',
    );
    expect(
      summarize(applyLiveBeat(withTool, { event: 'delta', text: '三只都齐了' }, 't2')),
    ).toEqual(['text:先读流程', 'tool:t1:bash:start', 'text:三只都齐了']);
  });

  it('closes the last matching open tool', () => {
    const started = applyLiveBeat(
      [],
      { event: 'tool', label: 'bash', status: 'start', input: '{}' },
      't1',
    );
    const second = applyLiveBeat(
      started,
      { event: 'tool', label: 'bash', status: 'start', input: '{}' },
      't2',
    );
    expect(
      summarize(
        applyLiveBeat(second, { event: 'tool', label: 'bash', status: 'end', output: 'ok' }, 't3'),
      ),
    ).toEqual(['tool:t1:bash:start', 'tool:t2:bash:end']);
  });

  it('ignores a tool end with no open match', () => {
    expect(
      summarize(applyLiveBeat([], { event: 'tool', label: 'bash', status: 'end', output: 'ok' }, 't1')),
    ).toEqual([]);
  });
});
