import type { CredentialsApi } from '../contract/credentials.js';
import { locateLongbridgeCli } from '../marketdata/longbridgeCli.js';
import { readLongbridgeToken, LongbridgeTokenError } from '../marketdata/longbridgeToken.js';
import { restampFromCredentialStatus } from '../marketdata/defaultProvider.js';
import { probeOpencli } from './opencli.js';

export const credentialsService: CredentialsApi = {
  async status() {
    let cliPath: string;
    try {
      cliPath = await locateLongbridgeCli();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      restampFromCredentialStatus(false);
      return {
        configured: false,
        method: 'cli',
        lastError: message,
        state: 'cli_missing' as const,
        cliPath: null,
      };
    }
    try {
      await readLongbridgeToken();
      restampFromCredentialStatus(true);
      return { configured: true, method: 'cli', lastError: null, state: 'ready' as const, cliPath };
    } catch (error) {
      const state =
        error instanceof LongbridgeTokenError && error.code === 'NOT_LOGGED_IN'
          ? ('login_required' as const)
          : ('token_unreadable' as const);
      const message = error instanceof Error ? error.message : String(error);
      restampFromCredentialStatus(false);
      return { configured: false, method: 'cli', lastError: message, state, cliPath };
    }
  },
  opencliStatus() {
    return probeOpencli();
  },
};
