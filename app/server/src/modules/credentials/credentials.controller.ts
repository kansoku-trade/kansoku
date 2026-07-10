import { Controller, Get } from "@tsuki-hono/common";
import { getLastCredentialError } from "../../services/credentials/credentialStatus.js";
import { getCredentialProvider } from "../../services/credentials/registry.js";

@Controller("credentials")
export class CredentialsController {
  @Get("/status")
  async getStatus() {
    const oauthViable = Boolean(process.env.LONGBRIDGE_OAUTH_CLIENT_ID);
    const credentials = oauthViable ? null : await getCredentialProvider().getLongbridgeCredentials();
    return { ok: true, data: { configured: oauthViable || credentials !== null, lastError: getLastCredentialError() } };
  }
}
