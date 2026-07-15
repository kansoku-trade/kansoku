// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTabsController, type TabsController } from "./tabsController";
import { loadTabsSnapshot, saveTabsSnapshot, type TabsSnapshot } from "./tabsStore";
import type { TabState, TabsMutateOp, TabsSnapshot as BridgeSnapshot } from "./desktopTabsBridge";

function makeTab(route: string, id = route): TabState {
  return { id, route, title: "Kansoku", scrollY: 0 };
}

class FakeBridge {
  revision = 0;
  tabs: TabState[] = [];
  listeners = new Set<(snapshot: BridgeSnapshot) => void>();
  mutateCalls: TabsMutateOp[] = [];
  injectForeignTabOnOpen = false;

  seed(tabs: TabState[]) {
    this.tabs = tabs;
    this.revision = 1;
  }

  async getSnapshot(): Promise<BridgeSnapshot> {
    return { revision: this.revision, tabs: this.tabs };
  }

  async mutate(op: TabsMutateOp): Promise<BridgeSnapshot> {
    this.mutateCalls.push(op);
    if (op.op === "open" && this.injectForeignTabOnOpen) {
      this.tabs = [...this.tabs, makeTab("/symbol/OTHER", "foreign-open")];
    }
    this.tabs = applyOp(this.tabs, op);
    this.revision += 1;
    const snapshot = { revision: this.revision, tabs: this.tabs };
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }

  onSnapshot(cb: (snapshot: BridgeSnapshot) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(snapshot: BridgeSnapshot) {
    for (const listener of this.listeners) listener(snapshot);
  }

  broadcastExternalClose(id: string) {
    this.tabs = this.tabs.filter((tab) => tab.id !== id);
    this.revision += 1;
    const snapshot = { revision: this.revision, tabs: this.tabs };
    for (const listener of this.listeners) listener(snapshot);
  }

  onCommand(): () => void {
    return () => {};
  }
}

function applyOp(tabs: TabState[], op: TabsMutateOp): TabState[] {
  switch (op.op) {
    case "open":
      return [...tabs, makeTab(op.route, op.id && !tabs.some((tab) => tab.id === op.id) ? op.id : `new-${tabs.length}`)];
    case "close":
      return tabs.filter((tab) => tab.id !== op.id);
    case "adopt":
      return tabs.length > 0 ? tabs : op.tabs;
    default:
      return tabs;
  }
}

function Probe({ onReady }: { onReady: (controller: TabsController) => void }) {
  const controller = useTabsController();
  onReady(controller);
  return null;
}

function renderController() {
  let latest!: TabsController;
  render(<Probe onReady={(controller) => (latest = controller)} />);
  return () => latest;
}

describe("useTabsController with shared bridge", () => {
  let bridge: FakeBridge;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    bridge = new FakeBridge();
    (window as unknown as { desktop: unknown }).desktop = { tabs: bridge };
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { desktop?: unknown }).desktop;
  });

  it("renders tabs driven by the main-process broadcast", async () => {
    bridge.seed([makeTab("/"), makeTab("/settings")]);
    const getController = renderController();

    await waitFor(() => {
      expect(getController().snapshot.tabs.map((t) => t.route)).toEqual(["/", "/settings"]);
    });
  });

  it("submits a mutate call with a client-supplied id and activates exactly that tab", async () => {
    bridge.seed([makeTab("/")]);
    const getController = renderController();
    await waitFor(() => expect(getController().snapshot.tabs).toHaveLength(1));

    act(() => getController().openTab("/symbol/NVDA"));

    await waitFor(() => {
      const openCall = bridge.mutateCalls.find((op) => op.op === "open" && op.route === "/symbol/NVDA");
      expect(openCall).toBeDefined();
      const openId = (openCall as { id?: string }).id;
      expect(openId).toBeTruthy();
      expect(getController().snapshot.tabs.some((t) => t.id === openId)).toBe(true);
      expect(getController().snapshot.activeTabId).toBe(openId);
    });
  });

  it("activates its own new tab even when the response contains another window's new tab", async () => {
    bridge.seed([makeTab("/")]);
    bridge.injectForeignTabOnOpen = true;
    const getController = renderController();
    await waitFor(() => expect(getController().snapshot.tabs).toHaveLength(1));

    act(() => getController().openTab("/symbol/NVDA"));

    await waitFor(() => {
      const openCall = bridge.mutateCalls.find((op) => op.op === "open" && op.route === "/symbol/NVDA");
      const openId = (openCall as { id?: string }).id;
      expect(getController().snapshot.tabs.some((t) => t.id === "foreign-open")).toBe(true);
      expect(getController().snapshot.activeTabId).toBe(openId);
    });
  });

  it("reselects the active tab when an external broadcast removes it", async () => {
    bridge.seed([makeTab("/", "a"), makeTab("/settings", "b"), makeTab("/logs", "c")]);
    const getController = renderController();
    await waitFor(() => expect(getController().snapshot.tabs).toHaveLength(3));
    expect(getController().snapshot.activeTabId).toBe("a");

    act(() => getController().activateTab("b"));
    await waitFor(() => expect(getController().snapshot.activeTabId).toBe("b"));

    act(() => bridge.broadcastExternalClose("b"));

    await waitFor(() => {
      expect(getController().snapshot.tabs.some((t) => t.id === "b")).toBe(false);
      expect(getController().snapshot.activeTabId).toBe("c");
    });
  });

  it("migrates legacy localStorage tabs into the shared store exactly once", async () => {
    const legacy: TabsSnapshot = {
      tabs: [makeTab("/", "legacy-a"), makeTab("/symbol/MU", "legacy-b")],
      activeTabId: "legacy-b",
    };
    saveTabsSnapshot(legacy);

    const getController = renderController();

    await waitFor(() => {
      expect(getController().snapshot.tabs.map((t) => t.id)).toEqual(["legacy-a", "legacy-b"]);
    });
    expect(bridge.mutateCalls.filter((op) => op.op === "adopt")).toHaveLength(1);
    expect(bridge.mutateCalls.filter((op) => op.op === "open")).toHaveLength(0);
  });

  it("opens a fresh home tab via open when the store is empty and there is no legacy archive", async () => {
    const getController = renderController();

    await waitFor(() => {
      expect(getController().snapshot.tabs).toHaveLength(1);
      expect(getController().snapshot.tabs[0].route).toBe("/");
      expect(getController().snapshot.activeTabId).toBe(getController().snapshot.tabs[0].id);
    });
    expect(bridge.mutateCalls.filter((op) => op.op === "adopt")).toHaveLength(0);
    expect(bridge.mutateCalls.filter((op) => op.op === "open")).toHaveLength(1);
  });

  it("ignores broadcasts whose revision is not newer than the last applied one", async () => {
    bridge.seed([makeTab("/", "a"), makeTab("/settings", "b")]);
    const getController = renderController();
    await waitFor(() => expect(getController().snapshot.tabs).toHaveLength(2));

    act(() => bridge.emit({ revision: 0, tabs: [makeTab("/logs", "stale")] }));
    act(() => bridge.emit({ revision: 1, tabs: [makeTab("/logs", "same-rev")] }));

    expect(getController().snapshot.tabs.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("restores the sessionStorage active tab on the first snapshot when it still exists", async () => {
    sessionStorage.setItem("desktop-active-tab-v1", "b");
    bridge.seed([makeTab("/", "a"), makeTab("/settings", "b")]);
    const getController = renderController();

    await waitFor(() => {
      expect(getController().snapshot.tabs).toHaveLength(2);
      expect(getController().snapshot.activeTabId).toBe("b");
    });
  });
});

describe("useTabsController without a shared bridge (web / old preload)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete (window as unknown as { desktop?: unknown }).desktop;
  });

  afterEach(() => {
    cleanup();
  });

  it("falls back to localStorage-backed state unchanged", async () => {
    const getController = renderController();
    await act(async () => {});

    expect(getController().snapshot.tabs).toHaveLength(1);
    expect(getController().snapshot.tabs[0].route).toBe("/");

    act(() => getController().openTab("/symbol/NVDA"));
    await act(async () => {});

    expect(loadTabsSnapshot().tabs.some((t) => t.route === "/symbol/NVDA")).toBe(true);
  });
});
