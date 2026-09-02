import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'kansoku-devdock-v1';

export interface DevDockState {
  expanded: boolean;
  pinOverrides: Record<string, boolean>;
  reactScan: boolean;
  mesurer: boolean;
}

const DEFAULT_STATE: DevDockState = {
  expanded: true,
  pinOverrides: {},
  reactScan: false,
  mesurer: false,
};

function readPersisted(): DevDockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<DevDockState>) }
      : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

let state = readPersisted();
const listeners = new Set<() => void>();

export function getDevDockState(): DevDockState {
  return state;
}

export function updateDevDock(patch: Partial<DevDockState>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or quota: the dock still works for this session */
  }
  for (const listener of listeners) listener();
}

export function setDevDockPinned(id: string, pinned: boolean): void {
  updateDevDock({ pinOverrides: { ...state.pinOverrides, [id]: pinned } });
}

export function subscribeDevDock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDevDock<T>(select: (state: DevDockState) => T): T {
  return useSyncExternalStore(
    subscribeDevDock,
    () => select(state),
    () => select(state),
  );
}

export function resetDevDockForTests(): void {
  state = DEFAULT_STATE;
  for (const listener of listeners) listener();
}
