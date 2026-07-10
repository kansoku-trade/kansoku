import { Config, QuoteContext } from "longbridge";
import { sanitizeAuthError } from "../../server/src/modules/settings/settingsValidation.js";
import type { LongbridgeCredentials } from "../../server/src/services/credentials/types.js";
import type { TestCredentialsResult } from "./credentialsBridge.js";
import { classifyCredentialTestError } from "./credentialsTestErrors.js";

const TEST_SYMBOL = "AAPL.US";

export async function testLongbridgeCredentials(creds: LongbridgeCredentials): Promise<TestCredentialsResult> {
  try {
    const config = Config.fromApikey(creds.appKey, creds.appSecret, creds.accessToken);
    const ctx = await QuoteContext.new(config);
    await ctx.quote([TEST_SYMBOL]);
    return { ok: true };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    // The submitted secrets are scrubbed before classification even though
    // classifyCredentialTestError never echoes the message back — defense in
    // depth against a future change accidentally logging or returning it.
    const scrubbed = sanitizeAuthError(rawMessage, [creds.appKey, creds.appSecret, creds.accessToken]);
    return { ok: false, error: classifyCredentialTestError(scrubbed) };
  }
}
