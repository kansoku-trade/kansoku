import { useCallback, useEffect, useRef, useState } from "react";
import { createMemoryRouteStore, __setActiveRouteStore, type RouteStore } from "../router";
import { __setActiveTitleSink } from "../useTitle";
import { getDesktopTabsBridge, getSharedTabsBridge, type SharedTabsBridge, type TabsSnapshot as SharedSnapshot } from "./desktopTabsBridge";
import * as tabsStore from "./tabsStore";
import { loadTabsSnapshot, saveTabsSnapshot, type TabsSnapshot, type TabState } from "./tabsStore";

const ACTIVE_TAB_STORAGE_KEY = "desktop-active-tab-v1";
const LEGACY_TABS_STORAGE_KEY = "desktop-tabs-v1";
const PLACEHOLDER_TAB: TabState = { id: "", route: "/", title: "Kansoku", scrollY: 0 };

export interface TabsController {
  snapshot: TabsSnapshot;
  activeTab: TabState;
  activateTab(id: string): void;
  closeTabById(id: string): void;
  closeOtherTabs(id: string): void;
  closeTabsToRight(id: string): void;
  openTab(route: string): void;
  openHomeTab(): void;
  focusOrOpenHome(): void;
  focusOrOpenResearch(): void;
  focusOrOpenSettings(): void;
  focusOrOpenLogs(): void;
  focusOrOpenChat(): void;
}

function readActiveTabId(): string {
  try {
    return sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeActiveTabId(id: string): void {
  try {
    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, id);
  } catch {
    return;
  }
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

function readLegacyTabs(): TabState[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tabs?: unknown };
    if (!Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.filter(isValidTab);
    return tabs.length > 0 ? tabs : null;
  } catch {
    return null;
  }
}

function reselectActiveTabId(prevTabs: TabState[], nextTabs: TabState[], activeTabId: string): string {
  if (nextTabs.length === 0) return activeTabId;
  if (nextTabs.some((tab) => tab.id === activeTabId)) return activeTabId;
  const idx = prevTabs.findIndex((tab) => tab.id === activeTabId);
  const clamped = Math.min(Math.max(idx, 0), nextTabs.length - 1);
  return nextTabs[clamped].id;
}

function withCurrentScrollCaptured(snapshot: TabsSnapshot): TabsSnapshot {
  return tabsStore.updateTabScroll(snapshot, snapshot.activeTabId, window.scrollY);
}

export function useTabsController(): TabsController {
  const [bridge] = useState<SharedTabsBridge | null>(() => getSharedTabsBridge());

  const [snapshot, setSnapshot] = useState<TabsSnapshot>(() =>
    bridge ? { tabs: [], activeTabId: readActiveTabId() } : loadTabsSnapshot(),
  );
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const lastRevisionRef = useRef(-1);
  const applySnapshot = useCallback((next: SharedSnapshot) => {
    if (next.revision <= lastRevisionRef.current) return;
    lastRevisionRef.current = next.revision;
    setSnapshot((prev) => {
      if (prev.tabs.length === 0) {
        const activeTabId = next.tabs.some((tab) => tab.id === prev.activeTabId)
          ? prev.activeTabId
          : next.tabs[0]?.id ?? "";
        return { tabs: next.tabs, activeTabId };
      }
      return {
        tabs: next.tabs,
        activeTabId: reselectActiveTabId(prev.tabs, next.tabs, prev.activeTabId),
      };
    });
  }, []);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;

    const unsubscribe = bridge.onSnapshot((next) => {
      if (!cancelled) applySnapshot(next);
    });

    void bridge.getSnapshot().then(async (initial) => {
      if (cancelled) return;
      if (initial.tabs.length > 0) {
        applySnapshot(initial);
        return;
      }
      const legacy = readLegacyTabs();
      const result = legacy
        ? await bridge.mutate({ op: "adopt", tabs: legacy })
        : await bridge.mutate({ op: "open", route: "/" });
      if (!cancelled) applySnapshot(result);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [bridge, applySnapshot]);

  useEffect(() => {
    if (bridge) {
      if (snapshot.activeTabId) writeActiveTabId(snapshot.activeTabId);
      return;
    }
    saveTabsSnapshot(snapshot);
  }, [snapshot, bridge]);

  const activeTab =
    snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ?? snapshot.tabs[0] ?? PLACEHOLDER_TAB;

  const storeRef = useRef<{ tabId: string; store: RouteStore } | null>(null);
  if (storeRef.current?.tabId !== activeTab.id) {
    storeRef.current = {
      tabId: activeTab.id,
      store: createMemoryRouteStore(activeTab.route, {
        onChange: (route) => {
          if (bridge) {
            void bridge.mutate({ op: "updateRoute", id: activeTab.id, route }).then(applySnapshot);
            return;
          }
          setSnapshot((prev) => tabsStore.updateTabRoute(prev, activeTab.id, route));
        },
      }),
    };
  }
  __setActiveRouteStore(storeRef.current.store);
  __setActiveTitleSink((title) => {
    if (bridge) {
      void bridge.mutate({ op: "updateTitle", id: activeTab.id, title }).then(applySnapshot);
      return;
    }
    setSnapshot((prev) => tabsStore.updateTabTitle(prev, activeTab.id, title));
  });

  const activeTabId = activeTab.id;
  useEffect(() => {
    window.scrollTo(0, activeTab.scrollY);
  }, [activeTabId]);

  const captureScroll = useCallback((): Promise<unknown> => {
    if (!bridge) return Promise.resolve();
    const id = snapshotRef.current.activeTabId;
    if (!id) return Promise.resolve();
    return bridge.mutate({ op: "updateScroll", id, scrollY: window.scrollY }).then(applySnapshot);
  }, [bridge, applySnapshot]);

  const activateTab = useCallback(
    (id: string) => {
      if (!snapshotRef.current.tabs.some((tab) => tab.id === id)) return;
      if (!bridge) {
        setSnapshot((prev) => tabsStore.activateTab(withCurrentScrollCaptured(prev), id));
        return;
      }
      void captureScroll();
      setSnapshot((prev) => ({ ...prev, activeTabId: id }));
    },
    [bridge, captureScroll],
  );

  const closeTabById = useCallback(
    (id: string) => {
      if (!bridge) {
        setSnapshot((prev) => tabsStore.closeTab(prev, id));
        return;
      }
      void bridge.mutate({ op: "close", id }).then(applySnapshot);
    },
    [bridge, applySnapshot],
  );

  const closeOtherTabs = useCallback(
    (id: string) => {
      if (!bridge) {
        setSnapshot((prev) => tabsStore.closeOtherTabs(withCurrentScrollCaptured(prev), id));
        return;
      }
      void captureScroll().then(() => bridge.mutate({ op: "closeOthers", id }).then(applySnapshot));
    },
    [bridge, captureScroll, applySnapshot],
  );

  const closeTabsToRight = useCallback(
    (id: string) => {
      if (!bridge) {
        setSnapshot((prev) => tabsStore.closeTabsToRight(withCurrentScrollCaptured(prev), id));
        return;
      }
      void captureScroll().then(() => bridge.mutate({ op: "closeToRight", id }).then(applySnapshot));
    },
    [bridge, captureScroll, applySnapshot],
  );

  const openTab = useCallback(
    (route: string) => {
      if (!bridge) {
        setSnapshot((prev) => tabsStore.openTab(withCurrentScrollCaptured(prev), route));
        return;
      }
      const id = crypto.randomUUID();
      void captureScroll().then(() =>
        bridge.mutate({ op: "open", route, id }).then((result) => {
          applySnapshot(result);
          setSnapshot((prev) => (prev.tabs.some((tab) => tab.id === id) ? { ...prev, activeTabId: id } : prev));
        }),
      );
    },
    [bridge, captureScroll, applySnapshot],
  );

  const openHomeTab = useCallback(() => openTab("/"), [openTab]);

  const focusOrOpenSettings = useCallback(() => {
    if (!bridge) {
      setSnapshot((prev) => tabsStore.focusOrOpenRoute(withCurrentScrollCaptured(prev), "/settings"));
      return;
    }
    const existing = snapshotRef.current.tabs.find((tab) => tab.route === "/settings");
    if (existing) activateTab(existing.id);
    else openTab("/settings");
  }, [bridge, activateTab, openTab]);

  const focusOrOpenLogs = useCallback(() => {
    if (!bridge) {
      setSnapshot((prev) => tabsStore.focusOrOpenRoute(withCurrentScrollCaptured(prev), "/logs"));
      return;
    }
    const existing = snapshotRef.current.tabs.find((tab) => tab.route === "/logs");
    if (existing) activateTab(existing.id);
    else openTab("/logs");
  }, [bridge, activateTab, openTab]);

  const focusOrOpenChat = useCallback(() => {
    if (!bridge) {
      setSnapshot((prev) => tabsStore.focusOrOpenRoute(withCurrentScrollCaptured(prev), "/chat"));
      return;
    }
    const existing = snapshotRef.current.tabs.find((tab) => tab.route === "/chat");
    if (existing) activateTab(existing.id);
    else openTab("/chat");
  }, [bridge, activateTab, openTab]);

  const focusOrOpenHome = useCallback(() => {
    if (!bridge) {
      setSnapshot((prev) => tabsStore.focusOrOpenRoute(withCurrentScrollCaptured(prev), "/"));
      return;
    }
    const existing = snapshotRef.current.tabs.find((tab) => tab.route === "/");
    if (existing) activateTab(existing.id);
    else openTab("/");
  }, [bridge, activateTab, openTab]);

  const focusOrOpenResearch = useCallback(() => {
    if (!bridge) {
      setSnapshot((prev) =>
        tabsStore.focusOrOpenRoutePrefix(withCurrentScrollCaptured(prev), "/research", "/research?view=journal"),
      );
      return;
    }
    const existing = snapshotRef.current.tabs.find(
      (tab) => tab.route === "/research" || tab.route.startsWith("/research?"),
    );
    if (existing) activateTab(existing.id);
    else openTab("/research?view=journal");
  }, [bridge, activateTab, openTab]);

  const closeActiveTab = useCallback(() => {
    if (!bridge) {
      setSnapshot((prev) => tabsStore.closeActiveTab(prev));
      return;
    }
    closeTabById(snapshotRef.current.activeTabId);
  }, [bridge, closeTabById]);

  const goToNextTab = useCallback(() => {
    if (!bridge) {
      setSnapshot((prev) => tabsStore.nextTab(prev));
      return;
    }
    const { tabs, activeTabId: currentId } = snapshotRef.current;
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((tab) => tab.id === currentId);
    activateTab(tabs[(idx + 1) % tabs.length].id);
  }, [bridge, activateTab]);

  const goToPrevTab = useCallback(() => {
    if (!bridge) {
      setSnapshot((prev) => tabsStore.prevTab(prev));
      return;
    }
    const { tabs, activeTabId: currentId } = snapshotRef.current;
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((tab) => tab.id === currentId);
    activateTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
  }, [bridge, activateTab]);

  useEffect(() => {
    const commandBridge = getDesktopTabsBridge();
    if (!commandBridge) return;
    return commandBridge.onCommand((command) => {
      if (command === "new-tab") openHomeTab();
      else if (command === "close-tab") closeActiveTab();
      else if (command === "next-tab") goToNextTab();
      else if (command === "prev-tab") goToPrevTab();
      else if (command === "open-settings") focusOrOpenSettings();
      else if (command === "open-logs") focusOrOpenLogs();
      else if (command === "open-research") focusOrOpenResearch();
      else if (command === "open-chat") focusOrOpenChat();
    });
  }, [openHomeTab, closeActiveTab, goToNextTab, goToPrevTab, focusOrOpenSettings, focusOrOpenLogs, focusOrOpenResearch, focusOrOpenChat]);

  return {
    snapshot,
    activeTab,
    activateTab,
    closeTabById,
    closeOtherTabs,
    closeTabsToRight,
    openTab,
    openHomeTab,
    focusOrOpenHome,
    focusOrOpenResearch,
    focusOrOpenSettings,
    focusOrOpenLogs,
    focusOrOpenChat,
  };
}
