import type {
  CredentialProvider,
  LongbridgeAuth,
  LongbridgeCredentials,
} from '@kansoku/core/credentials/types';
import type { CredentialStore, SetCredentialsResult } from './store.js';

export interface DesktopCredentialProvider extends CredentialProvider {
  setCredentials(creds: LongbridgeCredentials): SetCredentialsResult;
  setOAuth(clientId: string): SetCredentialsResult;
  clearCredentials(): void;
  isConfigured(): boolean;
  configuredMethod(): LongbridgeAuth['kind'] | null;
  lastError(): string | null;
}

export function createDesktopCredentialProvider(store: CredentialStore): DesktopCredentialProvider {
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const cb of listeners) cb();
  }

  function persist(auth: LongbridgeAuth): SetCredentialsResult {
    const result = store.set(auth);
    if (result.ok) notify();
    return result;
  }

  return {
    async getLongbridgeAuth(): Promise<LongbridgeAuth | null> {
      return store.get();
    },

    onChange(cb: () => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    setCredentials(creds: LongbridgeCredentials): SetCredentialsResult {
      return persist({ kind: 'apikey', ...creds });
    },

    setOAuth(clientId: string): SetCredentialsResult {
      return persist({ kind: 'oauth', clientId });
    },

    clearCredentials(): void {
      store.clear();
      notify();
    },

    isConfigured(): boolean {
      return store.get() !== null;
    },

    configuredMethod(): LongbridgeAuth['kind'] | null {
      return store.get()?.kind ?? null;
    },

    lastError(): string | null {
      return store.lastError();
    },
  };
}

export interface SelectCredentialProviderOptions {
  isDev: boolean;
  desktopProvider: CredentialProvider;
  envProvider: CredentialProvider;
}

// Packaged builds always defer to the desktop provider — even on a dev
// machine that also has .env Longbridge creds — so the safeStorage flow is
// the single source of truth once shipped. ELECTRON_DEV keeps the pre-P3
// env-backed workflow untouched, since dev runs the web client against its
// own standalone kernel (see preload.ts) and never exercises this IPC path.
export function selectCredentialProvider(
  opts: SelectCredentialProviderOptions,
): CredentialProvider {
  return opts.isDev ? opts.envProvider : opts.desktopProvider;
}
