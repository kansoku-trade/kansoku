// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { isContextMenuDivider } from '../../ui/contextMenu/types';
import { buildSessionMenuItems } from './AssistantSessionList';

describe('buildSessionMenuItems', () => {
  it('offers rename and delete', () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const items = buildSessionMenuItems({ onRename, onDelete });

    const commands = items.filter((item) => !isContextMenuDivider(item));
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
