// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isContextMenuDivider, type ContextMenuCommandItem } from '../../ui/contextMenu/types';
import { AssistantSessionList, buildSessionMenuItems, filterSessions } from './AssistantSessionList';
import type { AssistantSessionMeta } from '@kansoku/core/contract/index';

const sessions: AssistantSessionMeta[] = [
  { id: '1', title: 'Go Ahead Request', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: '2', title: '新对话', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
];

describe('filterSessions', () => {
  it('returns all sessions when the query is empty', () => {
    expect(filterSessions(sessions, '  ')).toEqual(sessions);
  });

  it('filters by title case-insensitively', () => {
    expect(filterSessions(sessions, 'ahead')).toEqual([sessions[0]]);
    expect(filterSessions(sessions, '对话')).toEqual([sessions[1]]);
    expect(filterSessions(sessions, 'nvda')).toEqual([]);
  });
});

afterEach(() => cleanup());

describe('AssistantSessionList chrome', () => {
  it('searches locally and keeps an icon-only create button', () => {
    const onCreate = vi.fn();
    render(
      <AssistantSessionList
        sessions={sessions}
        activeId="1"
        loading={false}
        error={null}
        onSelect={() => {}}
        onCreate={onCreate}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByRole('searchbox', { name: '搜索会话' })).toBeTruthy();
    const create = screen.getByRole('button', { name: '新建会话' });
    expect(create.textContent).not.toContain('新建会话');
    expect(screen.getByText('Go Ahead Request')).toBeTruthy();
    expect(screen.getByText('新对话')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索会话' }), {
      target: { value: 'ahead' },
    });
    expect(screen.getByText('Go Ahead Request')).toBeTruthy();
    expect(screen.queryByText('新对话')).toBeNull();

    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('buildSessionMenuItems', () => {
  it('offers rename and delete', () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const items = buildSessionMenuItems({ onRename, onDelete });

    const commands = items.filter((item): item is ContextMenuCommandItem => !isContextMenuDivider(item));
    expect(commands.map((item) => item.label)).toEqual(['重命名', '删除']);

    const rename = commands[0];
    const remove = commands[1];
    if (isContextMenuDivider(rename) || isContextMenuDivider(remove)) {
      throw new Error('expected commands');
    }
    expect(remove.danger).toBe(true);
    rename.onClick?.();
    remove.onClick?.();
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
