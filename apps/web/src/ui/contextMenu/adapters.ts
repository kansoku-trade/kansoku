import { getDesktopContextMenuBridge } from './electronBridge';
import { prepareContextMenuItems } from './serialize';
import type { ContextMenuAdapter, ContextMenuItem, ContextMenuPoint } from './types';
import { closeWebContextMenu, openWebContextMenu } from './webHost';

export function createWebContextMenuAdapter(): ContextMenuAdapter {
  return {
    kind: 'web',
    show(items, point) {
      openWebContextMenu(items, point);
    },
    close() {
      closeWebContextMenu();
    },
  };
}

export function createElectronContextMenuAdapter(
  popup: (request: {
    items: ReturnType<typeof prepareContextMenuItems>['serializable'];
    x: number;
    y: number;
  }) => Promise<{ selectedKey: string | null }>,
): ContextMenuAdapter {
  return {
    kind: 'electron',
    async show(items, point) {
      const prepared = prepareContextMenuItems(items);
      if (prepared.serializable.length === 0) return;

      closeWebContextMenu();
      const result = await popup({
        items: prepared.serializable,
        x: Math.round(point.x),
        y: Math.round(point.y),
      });
      if (!result.selectedKey) return;
      prepared.actions.get(result.selectedKey)?.();
    },
    close() {
      // Native menus dismiss themselves; no renderer-side surface to close.
    },
  };
}

export function resolveContextMenuAdapter(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): ContextMenuAdapter {
  const bridge = getDesktopContextMenuBridge(win);
  if (bridge) return createElectronContextMenuAdapter((request) => bridge.popup(request));
  return createWebContextMenuAdapter();
}

export function showViaAdapter(
  adapter: ContextMenuAdapter,
  items: ContextMenuItem[],
  point: ContextMenuPoint,
): void {
  void adapter.show(items, point);
}
