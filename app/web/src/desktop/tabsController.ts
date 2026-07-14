import { useCallback, useEffect, useRef, useState } from "react";
import { createMemoryRouteStore, __setActiveRouteStore, type RouteStore } from "../router";
import { __setActiveTitleSink } from "../useTitle";
import { getDesktopTabsBridge } from "./desktopTabsBridge";
import * as tabsStore from "./tabsStore";
import { loadTabsSnapshot, saveTabsSnapshot, type TabsSnapshot, type TabState } from "./tabsStore";

export interface TabsController {
  snapshot: TabsSnapshot;
  activeTab: TabState;
  activateTab(id: string): void;
  closeTabById(id: string): void;
  closeOtherTabs(id: string): void;
  closeTabsToRight(id: string): void;
  openHomeTab(): void;
  focusOrOpenResearch(): void;
  focusOrOpenSettings(): void;
  focusOrOpenLogs(): void;
}

function withCurrentScrollCaptured(snapshot: TabsSnapshot): TabsSnapshot {
  return tabsStore.updateTabScroll(snapshot, snapshot.activeTabId, window.scrollY);
}

export function useTabsController(): TabsController {
  const [snapshot, setSnapshot] = useState<TabsSnapshot>(() => loadTabsSnapshot());

  useEffect(() => {
    saveTabsSnapshot(snapshot);
  }, [snapshot]);

  const activeTab = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ?? snapshot.tabs[0];

  const storeRef = useRef<{ tabId: string; store: RouteStore } | null>(null);
  if (storeRef.current?.tabId !== activeTab.id) {
    storeRef.current = {
      tabId: activeTab.id,
      store: createMemoryRouteStore(activeTab.route, {
        onChange: (route) => setSnapshot((prev) => tabsStore.updateTabRoute(prev, activeTab.id, route)),
      }),
    };
  }
  __setActiveRouteStore(storeRef.current.store);
  __setActiveTitleSink((title) => setSnapshot((prev) => tabsStore.updateTabTitle(prev, activeTab.id, title)));

  const activeTabId = activeTab.id;
  useEffect(() => {
    window.scrollTo(0, activeTab.scrollY);
  }, [activeTabId]);

  const activateTab = useCallback((id: string) => {
    setSnapshot((prev) => tabsStore.activateTab(withCurrentScrollCaptured(prev), id));
  }, []);

  const closeTabById = useCallback((id: string) => {
    setSnapshot((prev) => tabsStore.closeTab(prev, id));
  }, []);

  const closeOtherTabs = useCallback((id: string) => {
    setSnapshot((prev) => tabsStore.closeOtherTabs(withCurrentScrollCaptured(prev), id));
  }, []);

  const closeTabsToRight = useCallback((id: string) => {
    setSnapshot((prev) => tabsStore.closeTabsToRight(withCurrentScrollCaptured(prev), id));
  }, []);

  const openHomeTab = useCallback(() => {
    setSnapshot((prev) => tabsStore.openTab(withCurrentScrollCaptured(prev), "/"));
  }, []);

  const focusOrOpenSettings = useCallback(() => {
    setSnapshot((prev) => tabsStore.focusOrOpenRoute(withCurrentScrollCaptured(prev), "/settings"));
  }, []);

  const focusOrOpenResearch = useCallback(() => {
    setSnapshot((prev) =>
      tabsStore.focusOrOpenRoutePrefix(withCurrentScrollCaptured(prev), "/research", "/research?view=journal"),
    );
  }, []);

  const focusOrOpenLogs = useCallback(() => {
    setSnapshot((prev) => tabsStore.focusOrOpenRoute(withCurrentScrollCaptured(prev), "/logs"));
  }, []);

  const closeActiveTab = useCallback(() => {
    setSnapshot((prev) => tabsStore.closeActiveTab(prev));
  }, []);

  const goToNextTab = useCallback(() => {
    setSnapshot((prev) => tabsStore.nextTab(prev));
  }, []);

  const goToPrevTab = useCallback(() => {
    setSnapshot((prev) => tabsStore.prevTab(prev));
  }, []);

  useEffect(() => {
    const bridge = getDesktopTabsBridge();
    if (!bridge) return;
    return bridge.onCommand((command) => {
      if (command === "new-tab") openHomeTab();
      else if (command === "close-tab") closeActiveTab();
      else if (command === "next-tab") goToNextTab();
      else if (command === "prev-tab") goToPrevTab();
      else if (command === "open-settings") focusOrOpenSettings();
      else if (command === "open-logs") focusOrOpenLogs();
    });
  }, [openHomeTab, closeActiveTab, goToNextTab, goToPrevTab, focusOrOpenSettings, focusOrOpenLogs]);

  return {
    snapshot,
    activeTab,
    activateTab,
    closeTabById,
    closeOtherTabs,
    closeTabsToRight,
    openHomeTab,
    focusOrOpenResearch,
    focusOrOpenSettings,
    focusOrOpenLogs,
  };
}
