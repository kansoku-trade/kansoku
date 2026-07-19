import { contextBridge, ipcRenderer } from 'electron';
import { CREDENTIALS_CHANNELS } from './data/credentials/channels.js';
import { IPC_GROUPS } from './kernel/ipc/groups.js';
import {
  RENDERER_CALL_REQUEST_CHANNEL,
  RENDERER_CALL_RESPONSE_CHANNEL,
  type RendererCallRequest,
  type RendererCallResponse,
} from './platform/rendererCall/channels.js';
import {
  TABS_COMMAND_CHANNEL,
  TABS_SNAPSHOT_CHANNEL,
  type TabsCommand,
} from './shell/tabs/channels.js';
import type { TabsState } from './shell/tabs/store.js';
import { UPDATER_CHANNELS } from './shell/updater/channels.js';

// main.ts boots one embedded kernel regardless of dev or packaged mode, so
// both the packaged app:// page and the dev renderer (ELECTRON_DEV=1, served
// from the Vite dev server at DEV_WEB_URL) talk to that same kernel over this
// same privileged IPC surface (MessagePort kernel bridge, rpc, credentials)
// — there is no longer a second, divergent kernel to guard against.
const isPrivilegedOrigin =
  location.protocol === 'app:' ||
  (process.env.ELECTRON_DEV === '1' && location.origin === 'http://localhost:5199');

const desktopApi: Record<string, unknown> = {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
};

function isAllowedIpcChannel(channel: string): boolean {
  return IPC_GROUPS.some((group) => channel.startsWith(`${group}.`));
}

if (isPrivilegedOrigin) {
  contextBridge.exposeInMainWorld('__DESKTOP_RT__', true);

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data !== 'desktop-rt-connect') return;
    const channel = new MessageChannel();
    ipcRenderer.postMessage('desktop-rt-connect', null, [channel.port2]);
    window.postMessage('desktop-rt-port', '*', [channel.port1]);
  });

  desktopApi.rpc = {
    async invoke(channel: string, ...args: unknown[]) {
      if (!isAllowedIpcChannel(channel)) {
        throw new Error(`ipc channel not allowed: ${channel}`);
      }
      return ipcRenderer.invoke(channel, ...args);
    },
  };

  desktopApi.credentials = {
    get: () => ipcRenderer.invoke(CREDENTIALS_CHANNELS.get),
  };

  desktopApi.tabs = {
    onCommand: (cb: (command: TabsCommand) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, command: TabsCommand) => cb(command);
      ipcRenderer.on(TABS_COMMAND_CHANNEL, listener);
      return () => ipcRenderer.removeListener(TABS_COMMAND_CHANNEL, listener);
    },
    onSnapshot: (cb: (snapshot: TabsState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: TabsState) => cb(snapshot);
      ipcRenderer.on(TABS_SNAPSHOT_CHANNEL, listener);
      return () => ipcRenderer.removeListener(TABS_SNAPSHOT_CHANNEL, listener);
    },
  };

  desktopApi.rendererCalls = {
    handle: (cb: (method: string, args: unknown) => Promise<unknown>) => {
      const listener = (_event: Electron.IpcRendererEvent, request: RendererCallRequest) => {
        void Promise.resolve()
          .then(() => cb(request.method, request.args))
          .then(
            (result) => {
              const response: RendererCallResponse = { id: request.id, ok: true, result };
              ipcRenderer.send(RENDERER_CALL_RESPONSE_CHANNEL, response);
            },
            (error: unknown) => {
              const response: RendererCallResponse = {
                id: request.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              };
              ipcRenderer.send(RENDERER_CALL_RESPONSE_CHANNEL, response);
            },
          );
      };
      ipcRenderer.on(RENDERER_CALL_REQUEST_CHANNEL, listener);
      return () => ipcRenderer.removeListener(RENDERER_CALL_REQUEST_CHANNEL, listener);
    },
  };

  desktopApi.updater = {
    onStatus: (cb: (status: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: unknown) => cb(status);
      ipcRenderer.on(UPDATER_CHANNELS.status, listener);
      return () => ipcRenderer.removeListener(UPDATER_CHANNELS.status, listener);
    },
  };
}

contextBridge.exposeInMainWorld('desktop', desktopApi);
