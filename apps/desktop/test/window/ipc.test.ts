import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WindowsIpcDeps } from '@desktop/shell/window/ipc.js';

type Handler = (...args: never[]) => unknown;

const handlers = new Map<string, Handler>();
const ipcMain = {
  handle: vi.fn((channel: string, handler: Handler) => {
    handlers.set(channel, handler);
  }),
};

vi.mock('electron', () => ({ ipcMain }));

const WINDOWS_CONTEXT_CHANNEL = 'windows.getContext';
const WINDOWS_ACTIVE_TAB_CHANNEL = 'windows.reportActiveTab';
const WINDOWS_POPOUT_CHANNEL = 'windows.openPopout';

// electron-ipc-decorator's IpcHandler singleton dedupes channel registration,
// so each test resets modules to re-register against fresh deps.
async function registerWindowsIpc(deps: WindowsIpcDeps): Promise<void> {
  vi.resetModules();
  const { WindowsIpc } = await import('@desktop/shell/window/ipc.js');
  new WindowsIpc(deps);
}

describe('WindowsIpc', () => {
  beforeEach(() => {
    handlers.clear();
    ipcMain.handle.mockClear();
  });

  it('resolves context for the calling window via getContext keyed by sender id', async () => {
    const getContext = vi.fn().mockReturnValue({ windowId: 'win-1', activeTabId: 'tab-a' });
    await registerWindowsIpc({
      getContext,
      reportActiveTab: vi.fn(),
      openPopout: vi.fn(),
      openWindow: vi.fn(),
    });

    const result = await handlers.get(WINDOWS_CONTEXT_CHANNEL)?.({ sender: { id: 7 } } as never);

    expect(getContext).toHaveBeenCalledWith(7);
    expect(result).toEqual({ windowId: 'win-1', activeTabId: 'tab-a' });
  });

  it('returns undefined when the sender is not a registered window', async () => {
    const getContext = vi.fn().mockReturnValue(undefined);
    await registerWindowsIpc({
      getContext,
      reportActiveTab: vi.fn(),
      openPopout: vi.fn(),
      openWindow: vi.fn(),
    });

    const result = await handlers.get(WINDOWS_CONTEXT_CHANNEL)?.({ sender: { id: 99 } } as never);

    expect(result).toBeUndefined();
  });

  it('forwards active-tab reports keyed by sender id', async () => {
    const reportActiveTab = vi.fn();
    await registerWindowsIpc({
      getContext: vi.fn(),
      reportActiveTab,
      openPopout: vi.fn(),
      openWindow: vi.fn(),
    });

    await handlers
      .get(WINDOWS_ACTIVE_TAB_CHANNEL)
      ?.({ sender: { id: 9 } } as never, 'tab-z' as never);

    expect(reportActiveTab).toHaveBeenCalledWith(9, 'tab-z');
  });

  it('opens a popout window for the requested symbol', async () => {
    const openPopout = vi.fn();
    await registerWindowsIpc({
      getContext: vi.fn(),
      reportActiveTab: vi.fn(),
      openPopout,
      openWindow: vi.fn(),
    });

    await handlers.get(WINDOWS_POPOUT_CHANNEL)?.({ sender: { id: 1 } } as never, 'NVDA' as never);

    expect(openPopout).toHaveBeenCalledWith('NVDA');
  });
});
