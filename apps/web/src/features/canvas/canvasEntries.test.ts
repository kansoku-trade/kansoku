import { describe, expect, it } from 'vitest';
import type { ChatRow } from '../cockpit/chat/useChatSession';
import { collectCanvasEntries, isLastSaveForSlug, latestCanvasChangeToken } from './canvasEntries';

function tool(
  id: string,
  slug: string,
  title: string,
  output = `saved slug=${slug} title=${title}`,
): ChatRow {
  return {
    id,
    ts: '2026-08-28T00:00:00.000Z',
    kind: 'tool',
    label: 'save_canvas',
    input: JSON.stringify({ slug, title, source: 'x' }),
    output,
  };
}

describe('collectCanvasEntries', () => {
  it('keeps the latest title for a repeated slug', () => {
    const rows: ChatRow[] = [
      tool('1', 'mu-panel', '初稿'),
      { id: '2', ts: '', kind: 'assistant', text: '改一下' },
      tool('3', 'mu-panel', '终稿'),
    ];
    expect(collectCanvasEntries(rows)).toEqual([{ slug: 'mu-panel', title: '终稿' }]);
    expect(isLastSaveForSlug(rows, 0, 'mu-panel')).toBe(false);
    expect(isLastSaveForSlug(rows, 2, 'mu-panel')).toBe(true);
  });

  it('ignores rejected saves', () => {
    expect(
      collectCanvasEntries([tool('1', 'bad', 'x', 'rejected: slug must be kebab-case')]),
    ).toEqual([]);
  });

  it('treats a successful edit_file call as an update to the same canvas', () => {
    const edited: ChatRow = {
      id: 'edit-1',
      ts: '2026-08-28T00:00:00.000Z',
      kind: 'tool',
      label: 'Edit File',
      input: JSON.stringify({
        path: 'journal/canvases/mu-panel.canvas.tsx',
        old_text: '初稿',
        new_text: '终稿',
      }),
      output: 'edited path=journal/canvases/mu-panel.canvas.tsx slug=mu-panel title=MU 面板',
    };

    expect(collectCanvasEntries([edited])).toEqual([{ slug: 'mu-panel', title: 'MU 面板' }]);
    expect(latestCanvasChangeToken([edited])).toBe('edit-1');
  });
});
