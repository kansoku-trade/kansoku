import { describe, expect, it } from "vitest";
import {
  activateTab,
  closeActiveTab,
  closeTab,
  focusOrOpenRoute,
  focusOrOpenRoutePrefix,
  loadTabsSnapshot,
  nextTab,
  openTab,
  prevTab,
  saveTabsSnapshot,
  tabKind,
  updateTabRoute,
  updateTabScroll,
  updateTabTitle,
  type TabsSnapshot,
} from "./tabsStore.js";

function snapshotOf(routes: string[], activeIndex = 0): TabsSnapshot {
  const tabs = routes.map((route, i) => ({ id: `t${i}`, route, title: "Kansoku", scrollY: 0 }));
  return { tabs, activeTabId: tabs[activeIndex].id };
}

class FakeStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("openTab", () => {
  it("appends a new tab and activates it", () => {
    const snapshot = snapshotOf(["/"]);
    const next = openTab(snapshot, "/symbol/NVDA");
    expect(next.tabs).toHaveLength(2);
    expect(next.tabs[1].route).toBe("/symbol/NVDA");
    expect(next.activeTabId).toBe(next.tabs[1].id);
  });
});

describe("closeTab", () => {
  it("removes the tab and keeps the current active tab if it wasn't the one closed", () => {
    const snapshot = snapshotOf(["/", "/settings", "/symbol/NVDA"], 2);
    const next = closeTab(snapshot, snapshot.tabs[0].id);
    expect(next.tabs.map((t) => t.route)).toEqual(["/settings", "/symbol/NVDA"]);
    expect(next.activeTabId).toBe(snapshot.activeTabId);
  });

  it("activates the tab now at the same index when closing the active tab", () => {
    const snapshot = snapshotOf(["/", "/settings", "/symbol/NVDA"], 1);
    const next = closeTab(snapshot, snapshot.tabs[1].id);
    expect(next.tabs.map((t) => t.route)).toEqual(["/", "/symbol/NVDA"]);
    expect(next.activeTabId).toBe(next.tabs[1].id);
  });

  it("activates the new last tab when closing the rightmost active tab", () => {
    const snapshot = snapshotOf(["/", "/settings"], 1);
    const next = closeTab(snapshot, snapshot.tabs[1].id);
    expect(next.tabs.map((t) => t.route)).toEqual(["/"]);
    expect(next.activeTabId).toBe(next.tabs[0].id);
  });

  it("replaces the last remaining tab with a fresh home tab", () => {
    const snapshot = snapshotOf(["/symbol/NVDA"]);
    const next = closeTab(snapshot, snapshot.tabs[0].id);
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].route).toBe("/");
    expect(next.activeTabId).toBe(next.tabs[0].id);
  });

  it("is a no-op for an unknown tab id", () => {
    const snapshot = snapshotOf(["/"]);
    expect(closeTab(snapshot, "missing")).toBe(snapshot);
  });
});

describe("closeActiveTab", () => {
  it("closes whichever tab is currently active", () => {
    const snapshot = snapshotOf(["/", "/settings"], 1);
    const next = closeActiveTab(snapshot);
    expect(next.tabs.map((t) => t.route)).toEqual(["/"]);
  });
});

describe("nextTab / prevTab", () => {
  it("cycles forward, wrapping to the first tab", () => {
    const snapshot = snapshotOf(["/", "/settings", "/symbol/NVDA"], 2);
    expect(nextTab(snapshot).activeTabId).toBe(snapshot.tabs[0].id);
  });

  it("cycles backward, wrapping to the last tab", () => {
    const snapshot = snapshotOf(["/", "/settings", "/symbol/NVDA"], 0);
    expect(prevTab(snapshot).activeTabId).toBe(snapshot.tabs[2].id);
  });

  it("is a no-op with a single tab", () => {
    const snapshot = snapshotOf(["/"]);
    expect(nextTab(snapshot)).toBe(snapshot);
    expect(prevTab(snapshot)).toBe(snapshot);
  });
});

describe("focusOrOpenRoute", () => {
  it("activates an existing tab with a matching route instead of opening a new one", () => {
    const snapshot = snapshotOf(["/", "/settings"], 0);
    const next = focusOrOpenRoute(snapshot, "/settings");
    expect(next.tabs).toHaveLength(2);
    expect(next.activeTabId).toBe(snapshot.tabs[1].id);
  });

  it("opens a new tab when no tab matches the route", () => {
    const snapshot = snapshotOf(["/"]);
    const next = focusOrOpenRoute(snapshot, "/settings");
    expect(next.tabs).toHaveLength(2);
    expect(next.tabs[1].route).toBe("/settings");
  });
});

describe("focusOrOpenRoutePrefix", () => {
  it("focuses an existing research tab regardless of its selected document", () => {
    const snapshot = snapshotOf(["/", "/research?view=stocks&path=stocks%2FMU.md"], 0);
    const next = focusOrOpenRoutePrefix(snapshot, "/research", "/research?view=journal");
    expect(next.tabs).toHaveLength(2);
    expect(next.activeTabId).toBe(snapshot.tabs[1].id);
  });

  it("opens the requested initial route when the route group is absent", () => {
    const snapshot = snapshotOf(["/"], 0);
    const next = focusOrOpenRoutePrefix(snapshot, "/research", "/research?view=journal");
    expect(next.tabs[1].route).toBe("/research?view=journal");
  });
});

describe("activateTab / updateTabRoute / updateTabTitle / updateTabScroll", () => {
  it("activateTab ignores an unknown id", () => {
    const snapshot = snapshotOf(["/"]);
    expect(activateTab(snapshot, "missing")).toBe(snapshot);
  });

  it("update helpers patch only the targeted tab", () => {
    const snapshot = snapshotOf(["/", "/settings"], 0);
    const withRoute = updateTabRoute(snapshot, snapshot.tabs[1].id, "/symbol/MRVL");
    const withTitle = updateTabTitle(withRoute, snapshot.tabs[1].id, "MRVL · Kansoku");
    const withScroll = updateTabScroll(withTitle, snapshot.tabs[1].id, 240);
    expect(withScroll.tabs[0]).toEqual(snapshot.tabs[0]);
    expect(withScroll.tabs[1]).toEqual({ id: snapshot.tabs[1].id, route: "/symbol/MRVL", title: "MRVL · Kansoku", scrollY: 240 });
  });
});

describe("tabKind", () => {
  it("classifies the home route", () => {
    expect(tabKind("/")).toBe("home");
  });

  it("classifies settings routes, with or without a query string", () => {
    expect(tabKind("/settings")).toBe("settings");
    expect(tabKind("/settings?tab=billing")).toBe("settings");
  });

  it("classifies research routes", () => {
    expect(tabKind("/research")).toBe("research");
    expect(tabKind("/research?view=journal")).toBe("research");
  });

  it("classifies chat routes", () => {
    expect(tabKind("/chat")).toBe("chat");
    expect(tabKind("/chat?session=abc")).toBe("chat");
  });

  it("classifies logs routes", () => {
    expect(tabKind("/logs")).toBe("logs");
    expect(tabKind("/logs?x=1")).toBe("logs");
  });

  it("classifies symbol routes", () => {
    expect(tabKind("/symbol/NVDA")).toBe("symbol");
  });

  it("falls back to other for anything else", () => {
    expect(tabKind("/charts/abc123")).toBe("other");
  });
});

describe("loadTabsSnapshot / saveTabsSnapshot", () => {
  it("falls back to a single home tab when storage is empty", () => {
    const snapshot = loadTabsSnapshot(new FakeStorage());
    expect(snapshot.tabs).toHaveLength(1);
    expect(snapshot.tabs[0].route).toBe("/");
  });

  it("falls back to a single home tab on malformed JSON", () => {
    const storage = new FakeStorage();
    storage.setItem("desktop-tabs-v1", "not json");
    const snapshot = loadTabsSnapshot(storage);
    expect(snapshot.tabs).toHaveLength(1);
  });

  it("falls back to a single home tab when the active id doesn't match any tab", () => {
    const storage = new FakeStorage();
    saveTabsSnapshot(snapshotOf(["/", "/settings"], 0), storage);
    const raw = JSON.parse(storage.getItem("desktop-tabs-v1")!);
    raw.activeTabId = "does-not-exist";
    storage.setItem("desktop-tabs-v1", JSON.stringify(raw));
    const snapshot = loadTabsSnapshot(storage);
    expect(snapshot.activeTabId).toBe(snapshot.tabs[0].id);
  });

  it("round-trips a snapshot through save then load", () => {
    const storage = new FakeStorage();
    const original = snapshotOf(["/", "/symbol/NVDA"], 1);
    saveTabsSnapshot(original, storage);
    expect(loadTabsSnapshot(storage)).toEqual(original);
  });
});
