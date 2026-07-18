export interface LongbridgeCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export type LongbridgeAuth =
  ({ kind: 'apikey' } & LongbridgeCredentials) | { kind: 'oauth'; clientId: string };

export interface CredentialProvider {
  getLongbridgeAuth(): Promise<LongbridgeAuth | null>;
  onChange(cb: () => void): () => void;
}
