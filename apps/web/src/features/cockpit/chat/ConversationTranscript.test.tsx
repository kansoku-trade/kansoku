// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationTranscript } from './ConversationTranscript';
import type { ChatRow } from './useChatSession';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it('renders panel suggestions without the assistant chrome class', () => {
    renderTranscript([], {
      variant: 'panel',
      suggestions: ['依据是什么？'],
    });
    expect(screen.getByRole('button', { name: '依据是什么？' })).toBeTruthy();
    expect(document.querySelector('.chat-suggestion')).toBeTruthy();
  });

  it('pins a sent user message, then gives the stream the reserved space', () => {
    const history = [
      row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '上一问' }),
      row({ id: 'a1', ts: ts('10:00:05'), kind: 'assistant', text: '上一答' }),
    ];
    const view = renderTranscript(history);
    const viewport = document.querySelector<HTMLElement>('.chat-transcript-viewport');
    const content = document.querySelector<HTMLElement>('.chat-panel-body-content');
    if (!viewport || !content) throw new Error('missing transcript elements');

    let contentHeight = 500;
    let scrollTop = 300;
    content.style.paddingTop = '16px';
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => 400 },
      scrollHeight: {
        configurable: true,
        get: () => {
          const spacer = document.querySelector<HTMLElement>('.chat-stream-space');
          return contentHeight + Number.parseFloat(spacer?.style.height || '0');
        },
      },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = Math.max(0, Math.min(value, viewport.scrollHeight - viewport.clientHeight));
        },
      },
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const height = this.classList.contains('chat-stream-space')
        ? Number.parseFloat(this.style.height || '0')
        : this === viewport
          ? 400
          : 30;
      const top =
        this.classList.contains('chat-row--user') && this.textContent === '新的问题'
          ? 396 - scrollTop
          : 0;
      return {
        bottom: top + height,
        height,
        left: 0,
        right: 0,
        top,
        width: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    });

    const liveRows = [
      ...history,
      row({ id: 'u2', ts: ts('10:01:00'), kind: 'user', text: '新的问题' }),
    ];
    const liveTranscript = (text: string) => (
      <ConversationTranscript
        rows={liveRows}
        busy
        streamText={text}
        liveTools={[]}
        suggestions={[]}
        emptyText="还没有对话"
        onPickSuggestion={() => {}}
      />
    );

    view.rerender(liveTranscript(''));
    expect(document.querySelector<HTMLElement>('.chat-stream-space')?.style.height).toBe('280px');
    expect(scrollTop).toBe(380);

    contentHeight = 620;
    view.rerender(liveTranscript('回答开始增长'));
    expect(document.querySelector<HTMLElement>('.chat-stream-space')?.style.height).toBe('160px');
    expect(scrollTop).toBe(380);

    contentHeight = 900;
    view.rerender(liveTranscript('回答超过一屏'));
    expect(document.querySelector<HTMLElement>('.chat-stream-space')?.style.height).toBe('0px');
    expect(scrollTop).toBe(500);
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

describe('ConversationTranscript user actions', () => {
  it('shows copy on an earlier user bubble and copy-edit-retry on the last user bubble', () => {
    const rows: ChatRow[] = [
      row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '第一问' }),
      row({ id: 'a1', ts: ts('10:00:01'), kind: 'assistant', text: '答' }),
      row({ id: 'u2', ts: ts('10:00:02'), kind: 'user', text: '第二问' }),
      row({ id: 'a2', ts: ts('10:00:03'), kind: 'assistant', text: '再答' }),
    ];
    renderTranscript(rows, { onRetryLast: () => {}, onEditLast: () => {} });
    const copyButtons = screen.getAllByRole('button', { name: '复制' });
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '重试' }).length).toBeGreaterThanOrEqual(1);
  });

  it('disables edit and retry on the last user bubble while busy', () => {
    render(
      <ConversationTranscript
        rows={[row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '问' })]}
        busy
        streamText=""
        liveTools={[]}
        suggestions={[]}
        emptyText=""
        onPickSuggestion={() => {}}
        onRetryLast={() => {}}
        onEditLast={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: '编辑' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '重试' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '复制' })).toHaveProperty('disabled', false);
  });
});
