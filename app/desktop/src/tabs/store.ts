import { readFile, writeFile } from "node:fs/promises";

const HOME_ROUTE = "/";
const DEFAULT_TITLE = "Kansoku";
const DEFAULT_DEBOUNCE_MS = 500;

export interface TabState {
  id: string;
  route: string;
  title: string;
  scrollY: number;
}

export interface TabsState {
  revision: number;
  tabs: TabState[];
}

export type MutateOp =
  | { op: "open"; route: string; id?: string }
  | { op: "close"; id: string }
  | { op: "closeOthers"; id: string }
  | { op: "closeToRight"; id: string }
  | { op: "updateRoute"; id: string; route: string }
  | { op: "updateTitle"; id: string; title: string }
  | { op: "updateScroll"; id: string; scrollY: number }
  | { op: "adopt"; tabs: TabState[] };

function makeTab(route: string, id?: string): TabState {
  return { id: id ?? crypto.randomUUID(), route, title: DEFAULT_TITLE, scrollY: 0 };
}

export function emptyTabsState(): TabsState {
  return { revision: 0, tabs: [] };
}

function withTabs(state: TabsState, tabs: TabState[]): TabsState {
  return { revision: state.revision + 1, tabs };
}

export function openTab(state: TabsState, route: string, id?: string): TabsState {
  const usableId = id && !state.tabs.some((tab) => tab.id === id) ? id : undefined;
  return withTabs(state, [...state.tabs, makeTab(route, usableId)]);
}

export function closeTab(state: TabsState, id: string): TabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  const remaining = state.tabs.filter((tab) => tab.id !== id);
  if (remaining.length === 0) return { revision: state.revision + 1, tabs: [makeTab(HOME_ROUTE)] };
  return withTabs(state, remaining);
}

export function closeOtherTabs(state: TabsState, id: string): TabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  return withTabs(state, state.tabs.filter((tab) => tab.id === id));
}

export function closeTabsToRight(state: TabsState, id: string): TabsState {
  const idx = state.tabs.findIndex((tab) => tab.id === id);
  if (idx === -1) return state;
  return withTabs(state, state.tabs.slice(0, idx + 1));
}

function patchTab(state: TabsState, id: string, patch: Partial<Omit<TabState, "id">>): TabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  return withTabs(state, state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)));
}

export function updateTabRoute(state: TabsState, id: string, route: string): TabsState {
  return patchTab(state, id, { route });
}

export function updateTabTitle(state: TabsState, id: string, title: string): TabsState {
  return patchTab(state, id, { title });
}

export function updateTabScroll(state: TabsState, id: string, scrollY: number): TabsState {
  return patchTab(state, id, { scrollY });
}

function isValidTab(value: unknown): value is TabState {
  if (!value || typeof value !== "object") return false;
  const tab = value as Record<string, unknown>;
  return (
    typeof tab.id === "string" &&
    typeof tab.route === "string" &&
    typeof tab.title === "string" &&
    typeof tab.scrollY === "number"
  );
}

export function adoptTabs(state: TabsState, tabs: TabState[]): TabsState {
  if (state.tabs.length > 0) return state;
  const valid = tabs.filter(isValidTab);
  if (valid.length === 0) return state;
  return { revision: state.revision + 1, tabs: valid };
}

export function applyMutation(state: TabsState, mutation: MutateOp): TabsState {
  switch (mutation.op) {
    case "open":
      return openTab(state, mutation.route, mutation.id);
    case "close":
      return closeTab(state, mutation.id);
    case "closeOthers":
      return closeOtherTabs(state, mutation.id);
    case "closeToRight":
      return closeTabsToRight(state, mutation.id);
    case "updateRoute":
      return updateTabRoute(state, mutation.id, mutation.route);
    case "updateTitle":
      return updateTabTitle(state, mutation.id, mutation.title);
    case "updateScroll":
      return updateTabScroll(state, mutation.id, mutation.scrollY);
    case "adopt":
      return adoptTabs(state, mutation.tabs);
    default:
      return state;
  }
}

function isValidTabsState(value: unknown): value is TabsState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.revision === "number" &&
    Array.isArray(state.tabs) &&
    state.tabs.every(isValidTab)
  );
}

export interface TabsFileStore {
  load(): Promise<TabsState>;
  scheduleSave(state: TabsState): void;
  flush(): Promise<void>;
}

export function createTabsFileStore(
  filePath: string,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): TabsFileStore {
  let pending: TabsState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function writeNow(state: TabsState): Promise<void> {
    await writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
  }

  return {
    async load(): Promise<TabsState> {
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidTabsState(parsed)) return emptyTabsState();
        return parsed;
      } catch {
        return emptyTabsState();
      }
    },

    scheduleSave(state: TabsState): void {
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
