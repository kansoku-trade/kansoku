import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addWindowEntry,
  createWindowsFileStore,
  emptyWindowsState,
  nextWindowId,
  removeWindowEntry,
  updateActiveTab,
  type WindowsState,
} from "../../src/window/store.js";

describe("nextWindowId", () => {
  it("starts at win-1 when there are no existing windows", () => {
    expect(nextWindowId([])).toBe("win-1");
  });

  it("picks the lowest unused ordinal", () => {
    expect(nextWindowId(["win-1"])).toBe("win-2");
    expect(nextWindowId(["win-1", "win-2"])).toBe("win-3");
  });

  it("reuses an ordinal freed by closing a window", () => {
    expect(nextWindowId(["win-1", "win-3"])).toBe("win-2");
  });

  it("ignores ids that do not match the win-N pattern", () => {
    expect(nextWindowId(["popout-abc", "win-1"])).toBe("win-2");
  });
});

describe("addWindowEntry", () => {
  it("appends a new entry", () => {
    const state = addWindowEntry(emptyWindowsState(), "win-1", "tab-a");
    expect(state).toEqual([{ id: "win-1", activeTabId: "tab-a" }]);
  });

  it("is a no-op when the id already exists", () => {
    const state = addWindowEntry(emptyWindowsState(), "win-1", "tab-a");
    const next = addWindowEntry(state, "win-1", "tab-b");
    expect(next).toBe(state);
  });
});

describe("removeWindowEntry", () => {
  it("removes the matching entry", () => {
    let state = addWindowEntry(emptyWindowsState(), "win-1", "tab-a");
    state = addWindowEntry(state, "win-2", "tab-b");
    const next = removeWindowEntry(state, "win-1");
    expect(next).toEqual([{ id: "win-2", activeTabId: "tab-b" }]);
  });

  it("is a no-op when the id is not present", () => {
    const state = addWindowEntry(emptyWindowsState(), "win-1", "tab-a");
    const next = removeWindowEntry(state, "win-9");
    expect(next).toBe(state);
  });
});

describe("updateActiveTab", () => {
  it("patches the matching entry", () => {
    const state = addWindowEntry(emptyWindowsState(), "win-1", "tab-a");
    const next = updateActiveTab(state, "win-1", "tab-b");
    expect(next).toEqual([{ id: "win-1", activeTabId: "tab-b" }]);
  });

  it("is a no-op when the id is not present", () => {
    const state = addWindowEntry(emptyWindowsState(), "win-1", "tab-a");
    const next = updateActiveTab(state, "win-9", "tab-b");
    expect(next).toBe(state);
  });

  it("is a no-op when the value is unchanged", () => {
    const state = addWindowEntry(emptyWindowsState(), "win-1", "tab-a");
    const next = updateActiveTab(state, "win-1", "tab-a");
    expect(next).toBe(state);
  });
});

describe("createWindowsFileStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "windows-store-"));
    path = join(dir, "windows.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("yields an empty state when the file is absent", async () => {
    const store = createWindowsFileStore(path);
    expect(await store.load()).toEqual([]);
  });

  it("treats a corrupt file as an empty state", async () => {
    await writeFile(path, "not json");
    expect(await createWindowsFileStore(path).load()).toEqual([]);
  });

  it("treats a structurally invalid file as an empty state", async () => {
    await writeFile(path, JSON.stringify([{ id: 1 }]));
    expect(await createWindowsFileStore(path).load()).toEqual([]);
  });

  it("debounces scheduleSave and persists only the latest state after the wait", async () => {
    const debounceMs = 30;
    const store = createWindowsFileStore(path, debounceMs);
    const first: WindowsState = [{ id: "win-1", activeTabId: "tab-a" }];
    const second: WindowsState = [
      { id: "win-1", activeTabId: "tab-a" },
      { id: "win-2", activeTabId: "tab-b" },
    ];

    store.scheduleSave(first);
    await new Promise((resolve) => setTimeout(resolve, debounceMs / 2));
    store.scheduleSave(second);

    const readerMid = await readFile(path, "utf8").catch(() => null);
    expect(readerMid).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, debounceMs + 20));

    const raw = await readFile(path, "utf8");
    expect(JSON.parse(raw)).toEqual(second);
  });

  it("round-trips through load after a flush", async () => {
    const store = createWindowsFileStore(path, 500);
    const state: WindowsState = [{ id: "win-1", activeTabId: "tab-a" }];
    store.scheduleSave(state);
    await store.flush();

    const reloaded = await createWindowsFileStore(path).load();
    expect(reloaded).toEqual(state);
  });
});
