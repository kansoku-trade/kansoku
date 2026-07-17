import type { ReactNode } from "react";

export type ModalState = "entering" | "open" | "closing";
export type ModalSlot = ReactNode | ((close: () => void) => ReactNode);

export interface ModalOptions {
  title: ReactNode;
  body: ModalSlot;
  headerAction?: ModalSlot;
  panelClassName?: string;
  onClose?: () => void;
}

export interface ModalEntry extends ModalOptions {
  id: number;
  state: ModalState;
}

const CLOSE_MS = 180;

let nextId = 1;
let entries: ModalEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getSnapshot(): ModalEntry[] {
  return entries;
}

export function openModal(opts: ModalOptions): () => void {
  const id = nextId++;
  entries = [...entries, { id, ...opts, state: "entering" }];
  emit();
  // Double rAF lets the "entering" frame paint before the transition to
  // "open"; non-DOM environments (node test runners) fall back to a timeout.
  const nextFrame =
    typeof requestAnimationFrame === "function"
      ? (cb: () => void) => requestAnimationFrame(() => requestAnimationFrame(cb))
      : (cb: () => void) => void setTimeout(cb, 0);
  nextFrame(() => {
    entries = entries.map((e) => (e.id === id && e.state === "entering" ? { ...e, state: "open" } : e));
    emit();
  });
  return () => closeModal(id);
}

export function closeModal(id: number): void {
  const target = entries.find((e) => e.id === id);
  if (!target || target.state === "closing") return;
  entries = entries.map((e) => (e.id === id ? { ...e, state: "closing" } : e));
  emit();
  setTimeout(() => {
    entries = entries.filter((e) => e.id !== id);
    emit();
    target.onClose?.();
  }, CLOSE_MS);
}

export function resetModalStoreForTests(): void {
  entries = [];
  listeners.clear();
}
