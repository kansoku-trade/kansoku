import { LongbridgeQuoteSocket } from "./longbridgeSocket.js";

let instance: LongbridgeQuoteSocket | null = null;

export function getSharedQuoteSocket(): LongbridgeQuoteSocket {
  if (!instance) instance = new LongbridgeQuoteSocket();
  return instance;
}
