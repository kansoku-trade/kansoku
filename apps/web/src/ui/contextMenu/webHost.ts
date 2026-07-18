import type { ContextMenuItem, ContextMenuPoint } from "./types";

export interface ContextMenuAnchor {
  getBoundingClientRect: () => DOMRect;
}

interface ContextMenuState {
  open: boolean;
  items: ContextMenuItem[];
  anchor: ContextMenuAnchor | null;
}

const emptyState: ContextMenuState = { open: false, items: [], anchor: null };

let state: ContextMenuState = emptyState;
const listeners = new Set<() => void>();
const lastPointer = { x: 0, y: 0, ready: false };

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getSnapshot(): ContextMenuState {
  return state;
}

export function getServerSnapshot(): ContextMenuState {
  return emptyState;
}

export function updateLastPointer(event: MouseEvent | PointerEvent): void {
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
  lastPointer.ready = true;
}

export function getLastPointer(): ContextMenuPoint {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  if (!lastPointer.ready) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  return { x: lastPointer.x, y: lastPointer.y };
}

function anchorAt(x: number, y: number): ContextMenuAnchor {
  return {
    getBoundingClientRect: () =>
      ({
        x,
        y,
        top: y,
        left: x,
        right: x,
        bottom: y,
        width: 0,
        height: 0,
        toJSON: () => undefined,
      }) as DOMRect,
  };
}

export function openWebContextMenu(items: ContextMenuItem[], point: ContextMenuPoint): void {
  state = { open: true, items, anchor: anchorAt(point.x, point.y) };
  emit();
}

export function updateWebContextMenuItems(items: ContextMenuItem[]): void {
  state = { ...state, items };
  emit();
}

export function closeWebContextMenu(): void {
  state = emptyState;
  emit();
}
