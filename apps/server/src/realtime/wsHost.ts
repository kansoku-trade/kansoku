import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { handleConnection } from '@kansoku/core/realtime/channelProtocol';
import { wrapWebSocket } from './wsConnection.js';

export function attachWs(server: Server, path: string): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    if (pathname !== path) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  wss.on('connection', (ws) => handleConnection(wrapWebSocket(ws)));
  return wss;
}
