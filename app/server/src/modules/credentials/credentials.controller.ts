import { Controller, Get } from "@tsuki-hono/common";
import { getLastCredentialError } from "../../services/credentials/credentialStatus.js";
import { getCredentialProvider } from "../../services/credentials/registry.js";

@Controller("credentials")
export class CredentialsController {
  @Get("/status")
  async getStatus() {
    const credentials = await getCredentialProvider().getLongbridgeCredentials();
    return { ok: true, data: { configured: credentials !== null, lastError: getLastCredentialError() } };
  }
}
