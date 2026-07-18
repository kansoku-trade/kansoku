import type { WebSocket } from "ws";
import type { Connection } from "@kansoku/core/realtime/connection";

const PING_MS = 15_000;

export function wrapWebSocket(socket: WebSocket): Connection {
  const ping = setInterval(() => {
    if (socket.readyState === socket.OPEN) socket.ping();
  }, PING_MS);

  socket.on("close", () => clearInterval(ping));
  socket.on("error", () => socket.close());

  return {
    send(text) {
      if (socket.readyState === socket.OPEN) socket.send(text);
    },
    onMessage(cb) {
      socket.on("message", (buf) => cb(String(buf)));
    },
    onClose(cb) {
      socket.on("close", cb);
    },
  };
}
