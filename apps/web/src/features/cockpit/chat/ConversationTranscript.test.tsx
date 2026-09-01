// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationTranscript } from './ConversationTranscript';
import type { ChatRow } from './useChatSession';

afterEach(() => cleanup());

const ts = (clock: string) => `2026-08-31T${clock}.000Z`;

function row(partial: ChatRow): ChatRow {
  return partial;
}

const completedRows: ChatRow[] = [
  row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '拉三只' }),
  row({ id: 'a1', ts: ts('10:01:12'), kind: 'assistant', text: '先读流程' }),
  row({
    id: 't1',
    ts: ts('10:01:12'),
    kind: 'tool',
    label: 'read_skill',
    input: JSON.stringify({ name: 'canvas' }),
  }),
  row({
    id: 't2',
    ts: ts('10:01:12'),
    kind: 'tool',
    label: 'bash',
    input: JSON.stringify({ command: 'longbridge kline MRVL.US --period day --count 20' }),
  }),
  row({
    id: 't3',
    ts: ts('10:01:12'),
    kind: 'tool',
    label: 'save_canvas',
    input: JSON.stringify({ slug: 'e2e-three-layer', title: '三层强弱对照' }),
    output: 'saved slug=e2e-three-layer title=三层强弱对照',
  }),
  row({ id: 'a2', ts: ts('10:01:12'), kind: 'assistant', text: 'MRVL 最强' }),
];

function renderTranscript(rows: ChatRow[], extra?: Record<string, unknown>) {
  return render(
    <ConversationTranscript
      rows={rows}
      busy={false}
      streamText=""
      liveTools={[]}
      suggestions={[]}
      emptyText="还没有对话"
      onPickSuggestion={() => {}}
      {...extra}
    />,
  );
}

describe('ConversationTranscript chrome', () => {
  it('applies a custom user bubble class', () => {
    renderTranscript([row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '拉三只' })], {
      userBubbleClassName: 'bubble-round',
    });
    expect(document.querySelector('.chat-bubble--user')?.className).toContain('bubble-round');
  });
});

describe('ConversationTranscript folding', () => {
  it('hides the process behind 跑了 and leaves the last text', () => {
    renderTranscript(completedRows, { onOpenCanvas: vi.fn() });
    expect(screen.getByRole('button', { name: /跑了 1 分 12 秒/ })).toBeTruthy();
    expect(screen.getByText('MRVL 最强')).toBeTruthy();
    expect(screen.queryByText('先读流程')).toBeNull();
    expect(screen.queryByText('执行数据命令')).toBeNull();
    expect(screen.getByText('三层强弱对照')).toBeTruthy();
    expect(screen.getByText('e2e-three-layer')).toBeTruthy();
  });

  it('reveals the folded process when 跑了 is opened', () => {
    renderTranscript(completedRows, { onOpenCanvas: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: /跑了 1 分 12 秒/ }));
    expect(screen.getByText('先读流程')).toBeTruthy();
    expect(screen.getByText('3 个工具')).toBeTruthy();
  });

  it('shows only the group head and the running tool while the turn is live', () => {
    renderTranscript([row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '拉三只' })], {
      busy: true,
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
            status: 'start',
            input: JSON.stringify({ command: 'longbridge kline SMH.US --period day --count 20' }),
          },
        },
      ],
    });
    expect(screen.getByText('先读流程')).toBeTruthy();
    expect(screen.getByRole('button', { name: '2 个工具，进行中' })).toBeTruthy();
    expect(screen.getByText(/longbridge kline SMH\.US/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /跑了/ })).toBeNull();
    expect(screen.queryByText('canvas')).toBeNull();
  });
});
