import { BrowserWindow } from 'electron';
import { TABS_SNAPSHOT_CHANNEL } from './channels.js';
import {
  applyMutation,
  emptyTabsState,
  type MutateOp,
  type TabsFileStore,
  type TabsState,
} from './store.js';

export interface TabsService {
  current(): TabsState;
  snapshot(): Promise<TabsState>;
  mutate(op: MutateOp): Promise<TabsState>;
}

export function createTabsService(fileStore: TabsFileStore): TabsService {
  let state: TabsState = emptyTabsState();
  const ready = fileStore.load().then((loaded) => {
    state = loaded;
  });

  function broadcast(next: TabsState): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(TABS_SNAPSHOT_CHANNEL, next);
    }
  }

  return {
    current(): TabsState {
      return state;
    },

    async snapshot(): Promise<TabsState> {
      await ready;
      return state;
    },

    async mutate(op: MutateOp): Promise<TabsState> {
      await ready;
      const next = applyMutation(state, op);
      if (next !== state) {
        state = next;
        fileStore.scheduleSave(state);
        broadcast(state);
      }
      return state;
    },
  };
}
