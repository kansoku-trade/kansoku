import { describe, expect, it, vi } from 'vitest';
import { prepareContextMenuItems, normalizeDividers } from './serialize.js';

describe('prepareContextMenuItems', () => {
  it('strips callbacks and keeps serializable fields', () => {
    const onClick = vi.fn();
    const prepared = prepareContextMenuItems([
      { key: 'open', label: '打开', onClick },
      { type: 'divider' },
      { label: '复制', disabled: true },
    ]);

    expect(prepared.serializable).toEqual([
      {
        type: 'item',
        key: 'open',
        label: '打开',
        enabled: true,
        checked: undefined,
        radioGroup: undefined,
        accelerator: undefined,
        shortcut: undefined,
        danger: undefined,
      },
      { type: 'divider', key: 'divider-1' },
      {
        type: 'item',
        key: 'item-2',
        label: '复制',
        enabled: false,
        checked: undefined,
        radioGroup: undefined,
        accelerator: undefined,
        shortcut: undefined,
        danger: undefined,
      },
    ]);
    expect(prepared.actions.get('open')).toBe(onClick);
    expect(prepared.actions.has('item-2')).toBe(false);
  });

  it('maps accelerators to serializable + display shortcut', () => {
    const prepared = prepareContextMenuItems([
      {
        key: 'close',
        label: '关闭标签页',
        accelerator: 'CmdOrCtrl+W',
        onClick: () => {},
      },
      {
        key: 'custom',
        label: '自定义',
        accelerator: 'CmdOrCtrl+K',
        shortcut: '⌘K',
        onClick: () => {},
      },
    ]);

    const close = prepared.serializable[0];
    expect(close).toMatchObject({
      type: 'item',
      key: 'close',
      accelerator: 'CmdOrCtrl+W',
    });
    if (close.type === 'item') {
      expect(close.shortcut).toBeTruthy();
      expect(close.shortcut).toMatch(/W/);
    }
    expect(prepared.serializable[1]).toMatchObject({
      type: 'item',
      key: 'custom',
      accelerator: 'CmdOrCtrl+K',
      shortcut: '⌘K',
    });
  });

  it('nests submenus and registers leaf actions under their keys', () => {
    const leaf = vi.fn();
    const prepared = prepareContextMenuItems([
      {
        key: 'more',
        label: '更多',
        submenu: [
          { key: 'export', label: '导出', onClick: leaf },
          { type: 'divider' },
          { key: 'hidden', label: '隐藏', visible: false, onClick: vi.fn() },
        ],
      },
    ]);

    expect(prepared.serializable).toEqual([
      {
        type: 'submenu',
        key: 'more',
        label: '更多',
        enabled: true,
        items: [
          {
            type: 'item',
            key: 'export',
            label: '导出',
            enabled: true,
            checked: undefined,
            radioGroup: undefined,
            accelerator: undefined,
            shortcut: undefined,
            danger: undefined,
          },
        ],
      },
    ]);
    expect(prepared.actions.get('export')).toBe(leaf);
    expect(prepared.actions.has('hidden')).toBe(false);
  });

  it('drops invisible rows and empty submenus', () => {
    const prepared = prepareContextMenuItems([
      { key: 'gone', label: '不可见', visible: false, onClick: () => {} },
      { type: 'divider' },
      { key: 'empty', label: '空', submenu: [{ label: 'x', visible: false }] },
      { key: 'ok', label: '可见', onClick: () => {} },
    ]);
    expect(prepared.serializable.map((i) => i.key)).toEqual(['ok']);
  });

  it('preserves radio group and danger flags', () => {
    const prepared = prepareContextMenuItems([
      {
        key: 'a',
        label: 'A',
        radioGroup: 'view',
        checked: true,
        danger: true,
        onClick: () => {},
      },
    ]);
    expect(prepared.serializable[0]).toMatchObject({
      type: 'item',
      radioGroup: 'view',
      checked: true,
      danger: true,
    });
  });
});

describe('normalizeDividers', () => {
  it('collapses edge and duplicate dividers', () => {
    expect(
      normalizeDividers([
        { type: 'divider', key: 'd0' },
        { type: 'item', key: 'a', label: 'A', enabled: true },
        { type: 'divider', key: 'd1' },
        { type: 'divider', key: 'd2' },
        { type: 'item', key: 'b', label: 'B', enabled: true },
        { type: 'divider', key: 'd3' },
      ]),
    ).toEqual([
      { type: 'item', key: 'a', label: 'A', enabled: true },
      { type: 'divider', key: 'd1' },
      { type: 'item', key: 'b', label: 'B', enabled: true },
    ]);
  });
});
