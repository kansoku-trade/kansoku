import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: never[]) => unknown;

const handlers = new Map<string, Handler>();
const onHandlers = new Map<string, Handler>();
const ipcMain = {
  handle: vi.fn((channel: string, handler: Handler) => {
    handlers.set(channel, handler);
  }),
  on: vi.fn((channel: string, handler: Handler) => {
    onHandlers.set(channel, handler);
  }),
};

vi.mock("electron", () => ({ ipcMain }));

const { registerWindowsIpc } = await import("../../src/window/ipc.js");
const { WINDOWS_ACTIVE_TAB_CHANNEL, WINDOWS_CONTEXT_CHANNEL, WINDOWS_POPOUT_CHANNEL } = await import(
  "../../src/window/channels.js"
);

describe("registerWindowsIpc", () => {
  beforeEach(() => {
    handlers.clear();
    onHandlers.clear();
    ipcMain.handle.mockClear();
    ipcMain.on.mockClear();
  });

  it("resolves context for the calling window via getContext keyed by sender id", async () => {
    const getContext = vi.fn().mockReturnValue({ windowId: "win-1", activeTabId: "tab-a" });
    registerWindowsIpc({ getContext, reportActiveTab: vi.fn(), openPopout: vi.fn(), openWindow: vi.fn() });

    const result = await handlers.get(WINDOWS_CONTEXT_CHANNEL)?.({ sender: { id: 7 } } as never);

    expect(getContext).toHaveBeenCalledWith(7);
    expect(result).toEqual({ windowId: "win-1", activeTabId: "tab-a" });
  });

  it("returns undefined when the sender is not a registered window", async () => {
    const getContext = vi.fn().mockReturnValue(undefined);
    registerWindowsIpc({ getContext, reportActiveTab: vi.fn(), openPopout: vi.fn(), openWindow: vi.fn() });

    const result = await handlers.get(WINDOWS_CONTEXT_CHANNEL)?.({ sender: { id: 99 } } as never);

    expect(result).toBeUndefined();
  });

  it("forwards active-tab reports keyed by sender id", () => {
    const reportActiveTab = vi.fn();
    registerWindowsIpc({ getContext: vi.fn(), reportActiveTab, openPopout: vi.fn(), openWindow: vi.fn() });

    onHandlers.get(WINDOWS_ACTIVE_TAB_CHANNEL)?.({ sender: { id: 9 } } as never, "tab-z" as never);

    expect(reportActiveTab).toHaveBeenCalledWith(9, "tab-z");
  });

  it("opens a popout window for the requested symbol", async () => {
    const openPopout = vi.fn();
    registerWindowsIpc({ getContext: vi.fn(), reportActiveTab: vi.fn(), openPopout, openWindow: vi.fn() });

    await handlers.get(WINDOWS_POPOUT_CHANNEL)?.({ sender: { id: 1 } } as never, "NVDA" as never);

    expect(openPopout).toHaveBeenCalledWith("NVDA");
  });
});
