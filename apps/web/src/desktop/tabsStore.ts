const STORAGE_KEY = "desktop-tabs-v1";
const HOME_ROUTE = "/";
const DEFAULT_TITLE = "Kansoku";

export type TabState = {
  id: string;
  route: string;
  title: string;
  scrollY: number;
};

export type TabsSnapshot = {
  tabs: TabState[];
  activeTabId: string;
};

export type TabKind = "home" | "research" | "chat" | "settings" | "logs" | "symbol" | "other";

export function tabKind(route: string): TabKind {
  if (route === "/") return "home";
  if (route === "/research" || route.startsWith("/research?")) return "research";
  if (route === "/chat" || route.startsWith("/chat?")) return "chat";
  if (route === "/settings" || route.startsWith("/settings?")) return "settings";
  if (route === "/logs" || route.startsWith("/logs?")) return "logs";
  if (route.startsWith("/symbol/")) return "symbol";
  return "other";
}

function makeTab(route: string): TabState {
  return { id: crypto.randomUUID(), route, title: DEFAULT_TITLE, scrollY: 0 };
}

function defaultSnapshot(): TabsSnapshot {
  const tab = makeTab(HOME_ROUTE);
  return { tabs: [tab], activeTabId: tab.id };
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

export function loadTabsSnapshot(storage: Pick<Storage, "getItem"> = localStorage): TabsSnapshot {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultSnapshot();
    const parsed = JSON.parse(raw) as Partial<TabsSnapshot>;
    const tabs = Array.isArray(parsed.tabs) ? parsed.tabs.filter(isValidTab) : [];
    if (tabs.length === 0) return defaultSnapshot();
    const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId) ? (parsed.activeTabId as string) : tabs[0].id;
    return { tabs, activeTabId };
  } catch {
    return defaultSnapshot();
  }
}

export function saveTabsSnapshot(snapshot: TabsSnapshot, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function patchTab(snapshot: TabsSnapshot, id: string, patch: Partial<Omit<TabState, "id">>): TabsSnapshot {
  return { ...snapshot, tabs: snapshot.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)) };
}

export function updateTabRoute(snapshot: TabsSnapshot, id: string, route: string): TabsSnapshot {
  return patchTab(snapshot, id, { route });
}

export function updateTabTitle(snapshot: TabsSnapshot, id: string, title: string): TabsSnapshot {
  return patchTab(snapshot, id, { title });
}

export function updateTabScroll(snapshot: TabsSnapshot, id: string, scrollY: number): TabsSnapshot {
  return patchTab(snapshot, id, { scrollY });
}

export function openTab(snapshot: TabsSnapshot, route: string): TabsSnapshot {
  const tab = makeTab(route);
  return { tabs: [...snapshot.tabs, tab], activeTabId: tab.id };
}

export function activateTab(snapshot: TabsSnapshot, id: string): TabsSnapshot {
  if (!snapshot.tabs.some((tab) => tab.id === id)) return snapshot;
  return { ...snapshot, activeTabId: id };
}

export function closeTab(snapshot: TabsSnapshot, id: string): TabsSnapshot {
  const idx = snapshot.tabs.findIndex((tab) => tab.id === id);
  if (idx === -1) return snapshot;

  const remaining = snapshot.tabs.filter((tab) => tab.id !== id);
  if (remaining.length === 0) return defaultSnapshot();
  if (snapshot.activeTabId !== id) return { tabs: remaining, activeTabId: snapshot.activeTabId };

  const nextActive = remaining[Math.min(idx, remaining.length - 1)];
  return { tabs: remaining, activeTabId: nextActive.id };
}

export function closeOtherTabs(snapshot: TabsSnapshot, id: string): TabsSnapshot {
  if (!snapshot.tabs.some((tab) => tab.id === id)) return snapshot;
  return { tabs: snapshot.tabs.filter((tab) => tab.id === id), activeTabId: id };
}

export function closeTabsToRight(snapshot: TabsSnapshot, id: string): TabsSnapshot {
  const idx = snapshot.tabs.findIndex((tab) => tab.id === id);
  if (idx === -1) return snapshot;
  const tabs = snapshot.tabs.slice(0, idx + 1);
  const activeTabId = tabs.some((tab) => tab.id === snapshot.activeTabId) ? snapshot.activeTabId : id;
  return { tabs, activeTabId };
}

export function closeActiveTab(snapshot: TabsSnapshot): TabsSnapshot {
  return closeTab(snapshot, snapshot.activeTabId);
}

export function nextTab(snapshot: TabsSnapshot): TabsSnapshot {
  if (snapshot.tabs.length < 2) return snapshot;
  const idx = snapshot.tabs.findIndex((tab) => tab.id === snapshot.activeTabId);
  const next = snapshot.tabs[(idx + 1) % snapshot.tabs.length];
  return { ...snapshot, activeTabId: next.id };
}

export function prevTab(snapshot: TabsSnapshot): TabsSnapshot {
  if (snapshot.tabs.length < 2) return snapshot;
  const idx = snapshot.tabs.findIndex((tab) => tab.id === snapshot.activeTabId);
  const prev = snapshot.tabs[(idx - 1 + snapshot.tabs.length) % snapshot.tabs.length];
  return { ...snapshot, activeTabId: prev.id };
}

export function focusOrOpenRoute(snapshot: TabsSnapshot, route: string): TabsSnapshot {
  const existing = snapshot.tabs.find((tab) => tab.route === route);
  if (existing) return { ...snapshot, activeTabId: existing.id };
  return openTab(snapshot, route);
}

export function focusOrOpenRoutePrefix(snapshot: TabsSnapshot, prefix: string, initialRoute: string): TabsSnapshot {
  const existing = snapshot.tabs.find((tab) => tab.route === prefix || tab.route.startsWith(`${prefix}?`));
  if (existing) return { ...snapshot, activeTabId: existing.id };
  return openTab(snapshot, initialRoute);
}
