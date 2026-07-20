import type { CredentialProvider, LongbridgeAuth } from './types.js';

export const envCredentialProvider: CredentialProvider = {
  async getLongbridgeAuth(): Promise<LongbridgeAuth | null> {
    const clientId = process.env.LONGBRIDGE_OAUTH_CLIENT_ID;
    if (clientId) return { kind: 'oauth', clientId };
    const appKey = process.env.LONGBRIDGE_APP_KEY;
    const appSecret = process.env.LONGBRIDGE_APP_SECRET;
    const accessToken = process.env.LONGBRIDGE_ACCESS_TOKEN;
    if (!appKey || !appSecret || !accessToken) return null;
    return { kind: 'apikey', appKey, appSecret, accessToken };
  },

  // env vars don't change at runtime; nothing to subscribe to.
  onChange(): () => void {
    return () => {};
  },
};
