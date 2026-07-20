import { describe, expect, it, vi } from 'vitest';
import {
  createDesktopCredentialProvider,
  selectCredentialProvider,
} from '@desktop/data/credentials/provider.js';
import type { CredentialStore } from '@desktop/data/credentials/store.js';
import type { CredentialProvider } from '@kansoku/core/credentials/types';

const CREDS = { appKey: 'k', appSecret: 's', accessToken: 't' };
const APIKEY_AUTH = { kind: 'apikey' as const, ...CREDS };

function fakeStore(overrides: Partial<CredentialStore> = {}): CredentialStore {
  let value: typeof APIKEY_AUTH | { kind: 'oauth'; clientId: string } | null = null;
  return {
    get: () => value,
    set: (auth) => {
      value = auth;
      return { ok: true };
    },
    clear: () => {
      value = null;
    },
    lastError: () => null,
    ...overrides,
  };
}

describe('createDesktopCredentialProvider', () => {
  it('getLongbridgeAuth reads through to the store', async () => {
    const store = fakeStore();
    store.set(APIKEY_AUTH);
    const provider = createDesktopCredentialProvider(store);
    expect(await provider.getLongbridgeAuth()).toEqual(APIKEY_AUTH);
  });

  it('setCredentials persists tagged apikey auth', async () => {
    const store = fakeStore();
    const provider = createDesktopCredentialProvider(store);
    provider.setCredentials(CREDS);
    expect(await provider.getLongbridgeAuth()).toEqual(APIKEY_AUTH);
    expect(provider.configuredMethod()).toBe('apikey');
  });

  it('setOAuth persists oauth auth and fires onChange', async () => {
    const store = fakeStore();
    const provider = createDesktopCredentialProvider(store);
    const cb = vi.fn();
    provider.onChange(cb);
    const result = provider.setOAuth('client-123');
    expect(result).toEqual({ ok: true });
    expect(cb).toHaveBeenCalledOnce();
    expect(await provider.getLongbridgeAuth()).toEqual({ kind: 'oauth', clientId: 'client-123' });
    expect(provider.configuredMethod()).toBe('oauth');
  });

  it('configuredMethod returns null when nothing is stored', () => {
    const provider = createDesktopCredentialProvider(fakeStore());
    expect(provider.configuredMethod()).toBeNull();
  });

  it('fires onChange when setCredentials succeeds', () => {
    const store = fakeStore();
    const provider = createDesktopCredentialProvider(store);
    const cb = vi.fn();
    provider.onChange(cb);
    provider.setCredentials(CREDS);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not fire onChange when setCredentials fails', () => {
    const store = fakeStore({ set: () => ({ ok: false, error: 'boom' }) });
    const provider = createDesktopCredentialProvider(store);
    const cb = vi.fn();
    provider.onChange(cb);
    const result = provider.setCredentials(CREDS);
    expect(result).toEqual({ ok: false, error: 'boom' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires onChange on clearCredentials', () => {
    const store = fakeStore();
    store.set(APIKEY_AUTH);
    const provider = createDesktopCredentialProvider(store);
    const cb = vi.fn();
    provider.onChange(cb);
    provider.clearCredentials();
    expect(cb).toHaveBeenCalledOnce();
    expect(store.get()).toBeNull();
  });

  it('onChange returns an unsubscribe that stops further notifications', () => {
    const store = fakeStore();
    const provider = createDesktopCredentialProvider(store);
    const cb = vi.fn();
    const unsubscribe = provider.onChange(cb);
    unsubscribe();
    provider.setCredentials(CREDS);
    expect(cb).not.toHaveBeenCalled();
  });

  it('notifies multiple listeners registered on the same instance', () => {
    const store = fakeStore();
    const provider = createDesktopCredentialProvider(store);
    const a = vi.fn();
    const b = vi.fn();
    provider.onChange(a);
    provider.onChange(b);
    provider.setCredentials(CREDS);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('isConfigured reflects store state', () => {
    const store = fakeStore();
    const provider = createDesktopCredentialProvider(store);
    expect(provider.isConfigured()).toBe(false);
    provider.setCredentials(CREDS);
    expect(provider.isConfigured()).toBe(true);
    provider.clearCredentials();
    expect(provider.isConfigured()).toBe(false);
  });

  it('lastError delegates to the store', () => {
    const store = fakeStore({ lastError: () => 'some error' });
    const provider = createDesktopCredentialProvider(store);
    expect(provider.lastError()).toBe('some error');
  });
});

describe('selectCredentialProvider', () => {
  const desktopProvider = { id: 'desktop' } as unknown as CredentialProvider;
  const envProvider = { id: 'env' } as unknown as CredentialProvider;

  it('uses the desktop provider in packaged (non-dev) mode even if env creds exist', () => {
    const result = selectCredentialProvider({ isDev: false, desktopProvider, envProvider });
    expect(result).toBe(desktopProvider);
  });

  it('uses the env-backed provider in ELECTRON_DEV mode', () => {
    const result = selectCredentialProvider({ isDev: true, desktopProvider, envProvider });
    expect(result).toBe(envProvider);
  });
});
