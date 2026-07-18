import { describe, expect, it, vi } from 'vitest';
import {
  createElectronContextMenuAdapter,
  createWebContextMenuAdapter,
  resolveContextMenuAdapter,
} from './adapters.js';
import { getSnapshot } from './webHost.js';

describe('context menu adapters', () => {
  it('web adapter opens the Base UI host state', () => {
    const adapter = createWebContextMenuAdapter();
    expect(adapter.kind).toBe('web');
    adapter.show([{ key: 'a', label: 'A', onClick: () => {} }], { x: 10, y: 20 });
    const snap = getSnapshot();
    expect(snap.open).toBe(true);
    expect(snap.items).toHaveLength(1);
    adapter.close();
    expect(getSnapshot().open).toBe(false);
  });

  it('electron adapter pops native menu and runs selected action', async () => {
    const onClick = vi.fn();
    const popup = vi.fn(async () => ({ selectedKey: 'copy' as string | null }));
    const adapter = createElectronContextMenuAdapter(popup);
    expect(adapter.kind).toBe('electron');

    await adapter.show(
      [
        { key: 'copy', label: '复制', onClick },
        { type: 'divider' },
        { key: 'open', label: '打开', onClick: vi.fn() },
      ],
      { x: 12.4, y: 33.8 },
    );

    expect(popup).toHaveBeenCalledWith({
      items: [
        {
          type: 'item',
          key: 'copy',
          label: '复制',
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
          key: 'open',
          label: '打开',
          enabled: true,
          checked: undefined,
          radioGroup: undefined,
          accelerator: undefined,
          shortcut: undefined,
          danger: undefined,
        },
      ],
      x: 12,
      y: 34,
    });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('electron adapter ignores dismiss', async () => {
    const onClick = vi.fn();
    const adapter = createElectronContextMenuAdapter(async () => ({ selectedKey: null }));
    await adapter.show([{ key: 'copy', label: '复制', onClick }], { x: 0, y: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('resolves electron when desktop.contextMenu bridge exists', () => {
    const bridge = { popup: vi.fn(async () => ({ selectedKey: null })) };
    const adapter = resolveContextMenuAdapter({ desktop: { contextMenu: bridge } });
    expect(adapter.kind).toBe('electron');
  });

  it('falls back to web without bridge', () => {
    expect(resolveContextMenuAdapter({}).kind).toBe('web');
  });
});
