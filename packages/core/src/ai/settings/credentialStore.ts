import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';
import { eq, ne } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { providerCredentials } from '../../db/schema.js';
import type { SecretBox } from './secretBox.js';

export const LICENSE_PROVIDER_KEY = 'kansoku-license';

const CODEX_PROVIDER = 'openai-codex';

export interface CredentialListEntry {
  provider: string;
  kind: 'api_key' | 'oauth';
  masked: string | null;
  updatedAt: string;
  ok: boolean;
}

export interface AppCredentialStore extends CredentialStore {
  setApiKey(provider: string, key: string): void;
  listEntries(): CredentialListEntry[];
  wipeAll(): void;
}

interface CodexTokens {
  access_token: string;
  refresh_token: string;
  [key: string]: unknown;
}

interface CodexAuthFile {
  tokens?: CodexTokens;
  last_refresh?: string;
  [key: string]: unknown;
}

export function defaultCodexAuthPath(): string {
  const home = process.env.CODEX_HOME || path.join(homedir(), '.codex');
  return path.join(home, 'auth.json');
}

function jwtExpiryMs(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function readCodexAuthFile(authPath: string): Promise<CodexAuthFile | undefined> {
  try {
    const parsed = JSON.parse(await readFile(authPath, 'utf8')) as CodexAuthFile;
    if (
      typeof parsed?.tokens?.access_token !== 'string' ||
      typeof parsed.tokens.refresh_token !== 'string'
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function codexCredentialFromFile(auth: CodexAuthFile): Credential {
  const tokens = auth.tokens as CodexTokens;
  return {
    type: 'oauth',
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expires: jwtExpiryMs(tokens.access_token),
  };
}

export async function readCodexCredential(authPath: string): Promise<Credential | undefined> {
  const auth = await readCodexAuthFile(authPath);
  if (!auth) return undefined;
  return codexCredentialFromFile(auth);
}

async function writeCodexCredential(authPath: string, credential: Credential): Promise<void> {
  if (credential.type !== 'oauth') {
    throw new Error('credentialStore: openai-codex only accepts oauth credentials');
  }
  const existing = (await readCodexAuthFile(authPath)) ?? {};
  const updated: CodexAuthFile = {
    ...existing,
    tokens: {
      ...existing.tokens,
      access_token: credential.access,
      refresh_token: credential.refresh,
    },
    last_refresh: new Date().toISOString(),
  };
  await writeFile(authPath, JSON.stringify(updated, null, 2));
}

function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

export function createCredentialStore(
  db: Db,
  secretBox: SecretBox,
  opts?: { codexAuthPath?: string },
): AppCredentialStore {
  const codexAuthPath = opts?.codexAuthPath ?? defaultCodexAuthPath();
  const chains = new Map<string, Promise<unknown>>();
  const loggedDecryptErrors = new Set<string>();

  function enqueue<T>(provider: string, task: () => Promise<T>): Promise<T> {
    const prior = chains.get(provider) ?? Promise.resolve();
    const next = prior.then(task, task);
    chains.set(
      provider,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  function readDbCredential(provider: string): Credential | undefined {
    const row = db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.provider, provider))
      .get();
    if (!row) return undefined;
    try {
      const plaintext = secretBox.decrypt(provider, row.secret);
      return JSON.parse(plaintext) as Credential;
    } catch (err) {
      if (!loggedDecryptErrors.has(provider)) {
        loggedDecryptErrors.add(provider);
        console.error(
          `credentialStore: failed to decrypt credential for provider "${provider}": ${String(err)}`,
        );
      }
      return undefined;
    }
  }

  function writeDbCredential(provider: string, credential: Credential): void {
    const secret = secretBox.encrypt(provider, JSON.stringify(credential));
    const updatedAt = new Date().toISOString();
    db.insert(providerCredentials)
      .values({ provider, secret, updatedAt })
      .onConflictDoUpdate({ target: providerCredentials.provider, set: { secret, updatedAt } })
      .run();
    loggedDecryptErrors.delete(provider);
  }

  function deleteDbCredential(provider: string): void {
    db.delete(providerCredentials).where(eq(providerCredentials.provider, provider)).run();
    loggedDecryptErrors.delete(provider);
  }

  return {
    async read(provider: string): Promise<Credential | undefined> {
      if (provider === CODEX_PROVIDER) return readCodexCredential(codexAuthPath);
      return readDbCredential(provider);
    },

    async modify(
      provider: string,
      fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    ): Promise<Credential | undefined> {
      return enqueue(provider, async () => {
        if (provider === CODEX_PROVIDER) {
          const current = await readCodexCredential(codexAuthPath);
          const next = await fn(current);
          if (!next) return current;
          await writeCodexCredential(codexAuthPath, next);
          return readCodexCredential(codexAuthPath);
        }
        const current = readDbCredential(provider);
        const next = await fn(current);
        if (!next) return current;
        writeDbCredential(provider, next);
        return next;
      });
    },

    async delete(provider: string): Promise<void> {
      if (provider === CODEX_PROVIDER) {
        throw new Error(
          'credentialStore: openai-codex login is owned by the codex CLI; cannot delete',
        );
      }
      await enqueue(provider, async () => {
        deleteDbCredential(provider);
      });
    },

    setApiKey(provider: string, key: string): void {
      if (provider === CODEX_PROVIDER) {
        throw new Error('credentialStore: openai-codex does not accept an api key');
      }
      writeDbCredential(provider, { type: 'api_key', key });
    },

    async list(): Promise<readonly CredentialInfo[]> {
      const infos: CredentialInfo[] = [];
      const codex = await readCodexCredential(codexAuthPath);
      if (codex) infos.push({ providerId: CODEX_PROVIDER, type: codex.type });
      const rows = db.select().from(providerCredentials).all();
      for (const row of rows) {
        if (row.provider === LICENSE_PROVIDER_KEY) continue;
        try {
          const plaintext = secretBox.decrypt(row.provider, row.secret);
          const credential = JSON.parse(plaintext) as Credential;
          infos.push({ providerId: row.provider, type: credential.type });
        } catch {
          continue;
        }
      }
      return infos;
    },

    listEntries(): CredentialListEntry[] {
      const rows = db.select().from(providerCredentials).all();
      return rows
        .filter((row) => row.provider !== LICENSE_PROVIDER_KEY)
        .map((row) => {
          try {
            const plaintext = secretBox.decrypt(row.provider, row.secret);
            const credential = JSON.parse(plaintext) as Credential;
            const masked =
              credential.type === 'api_key' && credential.key ? maskKey(credential.key) : null;
            const oauthOk =
              credential.type === 'oauth' &&
              typeof credential.access === 'string' &&
              typeof credential.refresh === 'string' &&
              typeof credential.expires === 'number';
            return {
              provider: row.provider,
              kind: credential.type,
              masked,
              updatedAt: row.updatedAt,
              ok: credential.type === 'api_key' ? masked !== null : oauthOk,
            };
          } catch {
            return {
              provider: row.provider,
              kind: 'api_key',
              masked: null,
              updatedAt: row.updatedAt,
              ok: false,
            };
          }
        });
    },

    wipeAll(): void {
      db.delete(providerCredentials)
        .where(ne(providerCredentials.provider, LICENSE_PROVIDER_KEY))
        .run();
      loggedDecryptErrors.clear();
    },
  };
}
