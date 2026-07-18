import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WindowsState } from "@desktop/window/store.js";

type QuitHandler = () => void;

const quitHandlers: QuitHandler[] = [];
const app = {
  on: vi.fn((event: string, cb: QuitHandler) => {
    if (event === "before-quit") quitHandlers.push(cb);
  }),
};

type IpcHandler = (...args: never[]) => unknown;
const ipcMain = {
  handle: vi.fn((_channel: string, _handler: IpcHandler) => {}),
  on: vi.fn((_channel: string, _handler: IpcHandler) => {}),
};

vi.mock("electron", () => ({ app, ipcMain }));

class FakeWindow {
  webContents: { id: number };
  private closedHandlers: Array<() => void> = [];

  constructor(id: number) {
    this.webContents = { id };
  }

  on(event: string, cb: () => void): void {
    if (event === "closed") this.closedHandlers.push(cb);
  }

  emitClosed(): void {
    for (const cb of this.closedHandlers) cb();
  }
}

let nextSenderId = 1;
const createWindow = vi.fn(() => new FakeWindow(nextSenderId++));
const createPopoutWindow = vi.fn(() => new FakeWindow(nextSenderId++));

vi.mock("@desktop/window/mainWindow.js", () => ({ createWindow }));
vi.mock("@desktop/window/popoutWindow.js", () => ({ createPopoutWindow }));

const { createWindowManager } = await import("@desktop/window/windowManager.js");

function asFake(win: unknown): FakeWindow {
  return win as unknown as FakeWindow;
}

describe("createWindowManager", () => {
  let dir: string;

  beforeEach(() => {
    nextSenderId = 1;
    createWindow.mockClear();
    quitHandlers.length = 0;
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function readWindowsJson(): Promise<WindowsState> {
    const raw = await readFile(join(dir, "windows.json"), "utf8");
    return JSON.parse(raw) as WindowsState;
  }

  it("opens one default window when no state was persisted", async () => {
    dir = await mkdtemp(join(tmpdir(), "window-manager-"));
    const manager = await createWindowManager({ userDataDir: dir, debounceMs: 10 });

    manager.restoreWindows();

    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ stateFileName: "window-state-win-1.json" }),
    );
    expect(manager.windowCount()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

  it("allocates ids in order and reuses the ordinal freed by a user close", async () => {
    dir = await mkdtemp(join(tmpdir(), "window-manager-"));
    const manager = await createWindowManager({ userDataDir: dir, debounceMs: 10 });

    const w1 = manager.openWindow();
    manager.openWindow();
    expect(createWindow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ stateFileName: "window-state-win-1.json" }),
    );
    expect(createWindow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ stateFileName: "window-state-win-2.json" }),
    );

    asFake(w1).emitClosed();
    manager.openWindow();
    expect(createWindow).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ stateFileName: "window-state-win-1.json" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

  it("removes the windows.json entry when the user closes a window", async () => {
    dir = await mkdtemp(join(tmpdir(), "window-manager-"));
    const manager = await createWindowManager({ userDataDir: dir, debounceMs: 10 });

    const w1 = manager.openWindow();
    manager.openWindow();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await readWindowsJson()).toEqual([
      { id: "win-1", activeTabId: "" },
      { id: "win-2", activeTabId: "" },
    ]);

    asFake(w1).emitClosed();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await readWindowsJson()).toEqual([{ id: "win-2", activeTabId: "" }]);
    expect(manager.windowCount()).toBe(1);
  });

  it("does not remove entries when windows close as part of app quit", async () => {
    dir = await mkdtemp(join(tmpdir(), "window-manager-"));
    const manager = await createWindowManager({ userDataDir: dir, debounceMs: 10 });

    const w1 = manager.openWindow();
    const w2 = manager.openWindow();
    await new Promise((resolve) => setTimeout(resolve, 30));

    for (const handler of quitHandlers) handler();
    asFake(w1).emitClosed();
    asFake(w2).emitClosed();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(await readWindowsJson()).toEqual([
      { id: "win-1", activeTabId: "" },
      { id: "win-2", activeTabId: "" },
    ]);
    expect(manager.windowCount()).toBe(0);
  });

  it("restores every persisted window with its own active tab", async () => {
    dir = await mkdtemp(join(tmpdir(), "window-manager-"));
    const seedManager = await createWindowManager({ userDataDir: dir, debounceMs: 10 });
    seedManager.openWindow();
    seedManager.openWindow();
    await new Promise((resolve) => setTimeout(resolve, 30));

    createWindow.mockClear();
    const manager = await createWindowManager({ userDataDir: dir, debounceMs: 10 });
    manager.restoreWindows();

    expect(createWindow).toHaveBeenCalledTimes(2);
    expect(createWindow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ stateFileName: "window-state-win-1.json" }),
    );
    expect(createWindow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ stateFileName: "window-state-win-2.json" }),
    );
    expect(manager.windowCount()).toBe(2);
  });

  it("flushes a pending debounced save immediately", async () => {
    dir = await mkdtemp(join(tmpdir(), "window-manager-"));
    const manager = await createWindowManager({ userDataDir: dir, debounceMs: 500 });

    manager.openWindow();
    await manager.flush();

    expect(await readWindowsJson()).toEqual([{ id: "win-1", activeTabId: "" }]);
  });

  it("wires the popout ipc handler to createPopoutWindow without touching the windows registry", async () => {
    dir = await mkdtemp(join(tmpdir(), "window-manager-"));
    createPopoutWindow.mockClear();
    ipcMain.handle.mockClear();
    const manager = await createWindowManager({ userDataDir: dir, debounceMs: 10 });

    const popoutHandler = ipcMain.handle.mock.calls.find(([channel]) => channel === "desktop:windows:popout")?.[1];
    expect(popoutHandler).toBeDefined();

    await popoutHandler?.({} as never, "NVDA" as never);

    expect(createPopoutWindow).toHaveBeenCalledWith("NVDA");
    expect(manager.windowCount()).toBe(0);
  });

  it("opens a full window seeded with the requested active tab via the open ipc handler", async () => {
    dir = await mkdtemp(join(tmpdir(), "window-manager-"));
    ipcMain.handle.mockClear();
    const manager = await createWindowManager({ userDataDir: dir, debounceMs: 10 });

    const openHandler = ipcMain.handle.mock.calls.find(([channel]) => channel === "desktop:windows:open")?.[1];
    expect(openHandler).toBeDefined();

    await openHandler?.({} as never, "tab-42" as never);
    await manager.flush();

    expect(manager.windowCount()).toBe(1);
    expect(await readWindowsJson()).toEqual([{ id: "win-1", activeTabId: "tab-42" }]);

    await openHandler?.({} as never, 7 as never);
    await manager.flush();

    expect(await readWindowsJson()).toEqual([
      { id: "win-1", activeTabId: "tab-42" },
      { id: "win-2", activeTabId: "" },
    ]);
  });
});
