import { ipcMain } from "electron";
import { handleConnection } from "../../server/src/realtime/channelProtocol.js";
import type { Connection } from "../../server/src/realtime/connection.js";

const HANDSHAKE_CHANNEL = "desktop-rt-connect";

export interface PortLike {
  postMessage(message: unknown): void;
  on(event: "message", listener: (e: { data: unknown }) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  start(): void;
}

export function wrapMessagePort(port: PortLike): Connection {
  return {
    send(text) {
      port.postMessage(text);
    },
    onMessage(cb) {
      port.on("message", (e) => cb(String(e.data)));
    },
    onClose(cb) {
      port.on("close", cb);
    },
  };
}

export function attachRealtimeBridge(): void {
  ipcMain.on(HANDSHAKE_CHANNEL, (event) => {
    const port = event.ports[0] as unknown as PortLike | undefined;
    if (!port) return;
    handleConnection(wrapMessagePort(port));
    port.start();
  });
}
