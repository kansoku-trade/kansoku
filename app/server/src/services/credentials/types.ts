export interface LongbridgeCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export interface CredentialProvider {
  getLongbridgeCredentials(): Promise<LongbridgeCredentials | null>;
  onChange(cb: () => void): () => void;
}
