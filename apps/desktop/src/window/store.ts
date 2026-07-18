import { readFile, writeFile } from "node:fs/promises";

const DEFAULT_DEBOUNCE_MS = 500;
const WINDOW_ID_PATTERN = /^win-(\d+)$/;

export interface WindowEntry {
  id: string;
  activeTabId: string;
}

export type WindowsState = WindowEntry[];

export function emptyWindowsState(): WindowsState {
  return [];
}

function ordinalOf(id: string): number | null {
  const match = WINDOW_ID_PATTERN.exec(id);
  return match ? Number(match[1]) : null;
}

export function nextWindowId(existingIds: string[]): string {
  const used = new Set(existingIds.map(ordinalOf).filter((n): n is number => n !== null));
  let ordinal = 1;
  while (used.has(ordinal)) ordinal += 1;
  return `win-${ordinal}`;
}

export function addWindowEntry(state: WindowsState, id: string, activeTabId: string): WindowsState {
  if (state.some((entry) => entry.id === id)) return state;
  return [...state, { id, activeTabId }];
}

export function removeWindowEntry(state: WindowsState, id: string): WindowsState {
  if (!state.some((entry) => entry.id === id)) return state;
  return state.filter((entry) => entry.id !== id);
}

export function updateActiveTab(state: WindowsState, id: string, activeTabId: string): WindowsState {
  const idx = state.findIndex((entry) => entry.id === id);
  if (idx === -1) return state;
  if (state[idx].activeTabId === activeTabId) return state;
  const next = state.slice();
  next[idx] = { ...next[idx], activeTabId };
  return next;
}

function isValidEntry(value: unknown): value is WindowEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.activeTabId === "string";
}

function isValidWindowsState(value: unknown): value is WindowsState {
  return Array.isArray(value) && value.every(isValidEntry);
}

export interface WindowsFileStore {
  load(): Promise<WindowsState>;
  scheduleSave(state: WindowsState): void;
  flush(): Promise<void>;
}

export function createWindowsFileStore(
  filePath: string,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): WindowsFileStore {
  let pending: WindowsState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function writeNow(state: WindowsState): Promise<void> {
    await writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
  }

  return {
    async load(): Promise<WindowsState> {
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidWindowsState(parsed)) return emptyWindowsState();
        return parsed;
      } catch {
        return emptyWindowsState();
      }
    },

    scheduleSave(state: WindowsState): void {
      pending = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const toWrite = pending;
        pending = null;
        if (toWrite) void writeNow(toWrite);
      }, debounceMs);
    },

    async flush(): Promise<void> {
      if (timer) clearTimeout(timer);
      timer = null;
      const toWrite = pending;
      pending = null;
      if (toWrite) await writeNow(toWrite);
    },
  };
}
