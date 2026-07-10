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
      // A queued async push can land after the port is physically closed but
      // before its close event has propagated back to this listener.
      try {
        port.postMessage(text);
      } catch {}
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
