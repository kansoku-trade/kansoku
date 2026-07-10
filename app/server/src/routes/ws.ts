import websocket from "@fastify/websocket";
import type { FastifyPluginAsync } from "fastify";
import { handleConnection } from "../realtime/channelProtocol.js";
import { wrapWebSocket } from "../realtime/wsConnection.js";

export const wsRoute: FastifyPluginAsync = async (app) => {
  await app.register(websocket);
  app.get("/", { websocket: true }, (socket) => handleConnection(wrapWebSocket(socket)));
};
