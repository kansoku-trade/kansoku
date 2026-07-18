import { BrowserWindow, ipcMain } from 'electron';
import { TABS_GET_CHANNEL, TABS_MUTATE_CHANNEL, TABS_SNAPSHOT_CHANNEL } from './channels.js';
import {
  applyMutation,
  emptyTabsState,
  type MutateOp,
  type TabsFileStore,
  type TabsState,
} from './store.js';

export function registerTabsIpc(fileStore: TabsFileStore): void {
  let state: TabsState = emptyTabsState();
  const ready = fileStore.load().then((loaded) => {
    state = loaded;
  });

  function broadcast(next: TabsState): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(TABS_SNAPSHOT_CHANNEL, next);
    }
  }

  ipcMain.handle(TABS_GET_CHANNEL, async () => {
    await ready;
    return state;
  });

  ipcMain.handle(TABS_MUTATE_CHANNEL, async (_event, payload: MutateOp) => {
    await ready;
    const next = applyMutation(state, payload);
    if (next !== state) {
      state = next;
      fileStore.scheduleSave(state);
      broadcast(state);
    }
    return state;
  });
}
