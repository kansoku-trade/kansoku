import { resolveContextMenuAdapter } from './adapters';
import type { ContextMenuItem, ContextMenuPoint } from './types';
import { getLastPointer } from './webHost';

let adapterOverride: ReturnType<typeof resolveContextMenuAdapter> | null = null;

export function __setContextMenuAdapterForTests(
  adapter: ReturnType<typeof resolveContextMenuAdapter> | null,
): void {
  adapterOverride = adapter;
}

function adapter() {
  return adapterOverride ?? resolveContextMenuAdapter();
}

export function showContextMenu(items: ContextMenuItem[], point?: Partial<ContextMenuPoint>): void {
  if (typeof window === 'undefined') return;
  const last = getLastPointer();
  const resolved: ContextMenuPoint = {
    x: point?.x ?? last.x,
    y: point?.y ?? last.y,
  };
  void adapter().show(items, resolved);
}

export function closeContextMenu(): void {
  adapter().close();
}
