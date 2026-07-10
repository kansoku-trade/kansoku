import type { CredentialProvider, LongbridgeCredentials } from "./types.js";

export const envCredentialProvider: CredentialProvider = {
  async getLongbridgeCredentials(): Promise<LongbridgeCredentials | null> {
    const appKey = process.env.LONGBRIDGE_APP_KEY;
    const appSecret = process.env.LONGBRIDGE_APP_SECRET;
    const accessToken = process.env.LONGBRIDGE_ACCESS_TOKEN;
    if (!appKey || !appSecret || !accessToken) return null;
    return { appKey, appSecret, accessToken };
  },

  // env vars don't change at runtime; nothing to subscribe to.
  onChange(): () => void {
    return () => {};
  },
};
