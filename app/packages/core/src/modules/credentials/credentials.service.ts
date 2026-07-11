import type { CredentialsApi } from "../../contract/credentials.js";
import { getLastCredentialError } from "../../services/credentials/credentialStatus.js";
import { getCredentialProvider } from "../../services/credentials/registry.js";

export const credentialsService: CredentialsApi = {
  async status() {
    const auth = await getCredentialProvider().getLongbridgeAuth();
    return { configured: auth !== null, method: auth?.kind ?? null, lastError: getLastCredentialError() };
  },
};
