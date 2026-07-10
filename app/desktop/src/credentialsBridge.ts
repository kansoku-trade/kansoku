import type { LongbridgeCredentials } from "../../server/src/services/credentials/types.js";
import { CREDENTIALS_CHANNELS } from "./credentialsChannels.js";
import type { DesktopCredentialProvider } from "./desktopCredentialProvider.js";
import type { SetCredentialsResult } from "./credentialStore.js";

export type TestCredentialsResult = { ok: true } | { ok: false; error: string };
export type TestCredentialsFn = (creds: LongbridgeCredentials) => Promise<TestCredentialsResult>;

const TEST_MIN_GAP_MS = 2_000;

export interface CredentialsBridgeDeps {
  provider: DesktopCredentialProvider;
  testCredentials: TestCredentialsFn;
  now?: () => number;
}

export interface CredentialsGetResult {
  configured: boolean;
  lastError: string | null;
}

export interface CredentialsBridgeHandlers {
  get(): CredentialsGetResult;
  set(creds: LongbridgeCredentials): SetCredentialsResult;
  clear(): void;
  test(creds: LongbridgeCredentials): Promise<TestCredentialsResult>;
}

export function createCredentialsBridgeHandlers(deps: CredentialsBridgeDeps): CredentialsBridgeHandlers {
  const now = deps.now ?? Date.now;
  let inFlight: Promise<TestCredentialsResult> | null = null;
  let lastCompletedAt = 0;
  let hasCompletedOnce = false;

  return {
    get(): CredentialsGetResult {
      return { configured: deps.provider.isConfigured(), lastError: deps.provider.lastError() };
    },

    set(creds: LongbridgeCredentials): SetCredentialsResult {
      return deps.provider.setCredentials(creds);
    },

    clear(): void {
      deps.provider.clearCredentials();
    },

    async test(creds: LongbridgeCredentials): Promise<TestCredentialsResult> {
      if (inFlight) return { ok: false, error: "a credential test is already running" };

      const elapsed = now() - lastCompletedAt;
      if (hasCompletedOnce && elapsed < TEST_MIN_GAP_MS) {
        const waitSec = Math.ceil((TEST_MIN_GAP_MS - elapsed) / 1000);
        return { ok: false, error: `please wait ${waitSec}s before retrying` };
      }

      const run = deps.testCredentials(creds);
      inFlight = run;
      try {
        return await run;
      } finally {
        lastCompletedAt = now();
        hasCompletedOnce = true;
        inFlight = null;
      }
    },
  };
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export function registerCredentialsIpc(ipcMain: IpcMainLike, handlers: CredentialsBridgeHandlers): void {
  ipcMain.handle(CREDENTIALS_CHANNELS.get, () => handlers.get());
  ipcMain.handle(CREDENTIALS_CHANNELS.set, (_event, creds) => handlers.set(creds as LongbridgeCredentials));
  ipcMain.handle(CREDENTIALS_CHANNELS.clear, () => handlers.clear());
  ipcMain.handle(CREDENTIALS_CHANNELS.test, (_event, creds) => handlers.test(creds as LongbridgeCredentials));
}
