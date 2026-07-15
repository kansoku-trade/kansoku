import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMutation,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  createTabsFileStore,
  emptyTabsState,
  openTab,
  adoptTabs,
  updateTabRoute,
  updateTabScroll,
  updateTabTitle,
  type TabsState,
} from "../../src/tabs/store.js";

function homeState(): TabsState {
  return openTab(emptyTabsState(), "/");
}

function tabsOf(state: TabsState): string[] {
  return state.tabs.map((tab) => tab.id);
}

describe("emptyTabsState", () => {
  it("starts with no tabs at revision 0", () => {
    expect(emptyTabsState()).toEqual({ revision: 0, tabs: [] });
  });
});

describe("openTab", () => {
  it("appends a new tab and bumps revision", () => {
    const state = homeState();
    const next = openTab(state, "/symbol/NVDA.US");
    expect(next.revision).toBe(state.revision + 1);
    expect(next.tabs).toHaveLength(2);
    expect(next.tabs[1].route).toBe("/symbol/NVDA.US");
    expect(next.tabs[1].title).toBe("Kansoku");
    expect(next.tabs[1].scrollY).toBe(0);
  });

  it("uses a client-supplied id when it is not already taken", () => {
    const state = homeState();
    const next = openTab(state, "/symbol/NVDA.US", "client-id-1");
    expect(next.tabs[1].id).toBe("client-id-1");
  });

  it("falls back to a generated id when the supplied id collides", () => {
    const state = homeState();
    const takenId = state.tabs[0].id;
    const next = openTab(state, "/symbol/NVDA.US", takenId);
    expect(next.tabs).toHaveLength(2);
    expect(next.tabs[1].id).not.toBe(takenId);
    expect(next.tabs[1].id).toBeTruthy();
  });

  it("falls back to a generated id when the supplied id is empty", () => {
    const next = openTab(homeState(), "/symbol/NVDA.US", "");
    expect(next.tabs[1].id).not.toBe("");
  });

  it("applyMutation passes the supplied id through the open op", () => {
    const next = applyMutation(homeState(), { op: "open", route: "/logs", id: "client-id-2" });
    expect(next.tabs[1].id).toBe("client-id-2");
  });
});

describe("closeTab", () => {
  it("removes the tab and bumps revision", () => {
    const state = openTab(homeState(), "/symbol/NVDA.US");
    const targetId = state.tabs[0].id;
    const next = closeTab(state, targetId);
    expect(next.revision).toBe(state.revision + 1);
    expect(tabsOf(next)).not.toContain(targetId);
    expect(next.tabs).toHaveLength(1);
  });

  it("is a no-op when the tab does not exist", () => {
    const state = homeState();
    const next = closeTab(state, "missing-id");
    expect(next).toBe(state);
  });

  it("resets to a single home tab when the last tab is closed", () => {
    const state = homeState();
    const targetId = state.tabs[0].id;
    const next = closeTab(state, targetId);
    expect(next.revision).toBe(state.revision + 1);
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].route).toBe("/");
    expect(next.tabs[0].id).not.toBe(targetId);
  });
});

describe("closeOtherTabs", () => {
  it("keeps only the given tab", () => {
    let state = homeState();
    state = openTab(state, "/symbol/NVDA.US");
    state = openTab(state, "/symbol/MRVL.US");
    const keepId = state.tabs[1].id;
    const next = closeOtherTabs(state, keepId);
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].id).toBe(keepId);
    expect(next.revision).toBe(state.revision + 1);
  });

  it("is a no-op when the tab does not exist", () => {
    const state = homeState();
    const next = closeOtherTabs(state, "missing-id");
    expect(next).toBe(state);
  });
});

describe("closeTabsToRight", () => {
  it("drops every tab after the given id", () => {
    let state = homeState();
    state = openTab(state, "/symbol/NVDA.US");
    state = openTab(state, "/symbol/MRVL.US");
    const anchorId = state.tabs[1].id;
    const next = closeTabsToRight(state, anchorId);
    expect(tabsOf(next)).toEqual(state.tabs.slice(0, 2).map((tab) => tab.id));
    expect(next.revision).toBe(state.revision + 1);
  });

  it("is a no-op when the tab does not exist", () => {
    const state = homeState();
    const next = closeTabsToRight(state, "missing-id");
    expect(next).toBe(state);
  });
});

describe("updateTabRoute / updateTabTitle / updateTabScroll", () => {
  it("patches the matching tab and bumps revision", () => {
    const state = homeState();
    const id = state.tabs[0].id;

    const withRoute = updateTabRoute(state, id, "/symbol/NVDA.US");
    expect(withRoute.tabs[0].route).toBe("/symbol/NVDA.US");
    expect(withRoute.revision).toBe(state.revision + 1);

    const withTitle = updateTabTitle(withRoute, id, "NVDA");
    expect(withTitle.tabs[0].title).toBe("NVDA");
    expect(withTitle.revision).toBe(withRoute.revision + 1);

    const withScroll = updateTabScroll(withTitle, id, 240);
    expect(withScroll.tabs[0].scrollY).toBe(240);
    expect(withScroll.revision).toBe(withTitle.revision + 1);
  });

  it("is a no-op when the tab does not exist", () => {
    const state = homeState();
    expect(updateTabRoute(state, "missing-id", "/x")).toBe(state);
    expect(updateTabTitle(state, "missing-id", "x")).toBe(state);
    expect(updateTabScroll(state, "missing-id", 1)).toBe(state);
  });
});

describe("adoptTabs", () => {
  it("takes over an empty store", () => {
    const empty: TabsState = { revision: 3, tabs: [] };
    const legacyTabs = [{ id: "a", route: "/symbol/NVDA.US", title: "NVDA", scrollY: 10 }];
    const next = adoptTabs(empty, legacyTabs);
    expect(next.tabs).toEqual(legacyTabs);
    expect(next.revision).toBe(4);
  });

  it("is a no-op when the store already has tabs", () => {
    const state = homeState();
    const next = adoptTabs(state, [{ id: "a", route: "/", title: "x", scrollY: 0 }]);
    expect(next).toBe(state);
  });

  it("is a no-op when the incoming list has no valid tabs", () => {
    const empty = emptyTabsState();
    const next = adoptTabs(empty, [{ id: 1 } as never]);
    expect(next).toBe(empty);
  });
});

describe("applyMutation", () => {
  it("dispatches every op kind", () => {
    let state = applyMutation(emptyTabsState(), { op: "open", route: "/" });
    state = applyMutation(state, { op: "open", route: "/symbol/NVDA.US" });
    expect(state.tabs).toHaveLength(2);

    const id = state.tabs[1].id;
    state = applyMutation(state, { op: "updateTitle", id, title: "NVDA" });
    expect(state.tabs[1].title).toBe("NVDA");

    state = applyMutation(state, { op: "updateRoute", id, route: "/symbol/NVDA.US?tab=news" });
    expect(state.tabs[1].route).toBe("/symbol/NVDA.US?tab=news");

    state = applyMutation(state, { op: "updateScroll", id, scrollY: 99 });
    expect(state.tabs[1].scrollY).toBe(99);

    state = applyMutation(state, { op: "closeOthers", id });
    expect(state.tabs).toHaveLength(1);

    state = applyMutation(state, { op: "open", route: "/symbol/MRVL.US" });
    const rightId = state.tabs[0].id;
    state = applyMutation(state, { op: "closeToRight", id: rightId });
    expect(state.tabs).toHaveLength(1);

    state = applyMutation(state, { op: "close", id: rightId });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].route).toBe("/");

    const adopted = applyMutation(emptyTabsState(), {
      op: "adopt",
      tabs: [{ id: "z", route: "/", title: "x", scrollY: 0 }],
    });
    expect(adopted.tabs).toHaveLength(1);
  });
});

describe("createTabsFileStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tabs-store-"));
    path = join(dir, "tabs.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("yields an empty state when the file is absent", async () => {
    const store = createTabsFileStore(path);
    expect(await store.load()).toEqual({ revision: 0, tabs: [] });
  });

  it("treats a corrupt file as an empty state", async () => {
    await writeFile(path, "not json");
    expect(await createTabsFileStore(path).load()).toEqual({ revision: 0, tabs: [] });
  });

  it("treats a structurally invalid file as an empty state", async () => {
    await writeFile(path, JSON.stringify({ revision: "x", tabs: [{ id: 1 }] }));
    expect(await createTabsFileStore(path).load()).toEqual({ revision: 0, tabs: [] });
  });

  it("preserves a persisted empty tabs list", async () => {
    await writeFile(path, JSON.stringify({ revision: 7, tabs: [] }));
    expect(await createTabsFileStore(path).load()).toEqual({ revision: 7, tabs: [] });
  });

  it("debounces scheduleSave and persists only the latest state after the wait", async () => {
    const debounceMs = 30;
    const store = createTabsFileStore(path, debounceMs);
    const first = openTab(homeState(), "/symbol/NVDA.US");
    const second = openTab(first, "/symbol/MRVL.US");

    store.scheduleSave(first);
    await new Promise((resolve) => setTimeout(resolve, debounceMs / 2));
    store.scheduleSave(second);

    const readerMid = await readFile(path, "utf8").catch(() => null);
    expect(readerMid).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, debounceMs + 20));

    const raw = await readFile(path, "utf8");
    const persisted = JSON.parse(raw) as TabsState;
    expect(persisted.tabs).toHaveLength(3);
  });

  it("round-trips through load after a flush", async () => {
    const store = createTabsFileStore(path, 500);
    const state = openTab(homeState(), "/symbol/NVDA.US");
    store.scheduleSave(state);
    await store.flush();

    const reloaded = await createTabsFileStore(path).load();
    expect(reloaded).toEqual(state);
  });
});
