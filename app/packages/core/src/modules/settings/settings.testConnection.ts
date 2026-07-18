import type { AppCredentialStore } from "../../ai/credentialStore.js";
import { categorizeTestError, sanitizeAuthError, validateCustomRef } from "./settingsValidation.js";
import type { TestConnectionResult } from "../../contract/settings.js";
import type { SettingsDeps } from "./settings.deps.js";

const TEST_PROMPT_MAX_TOKENS = 16;

async function collectKnownSecrets(credentials: AppCredentialStore, provider: string): Promise<string[]> {
  try {
    const credential = await credentials.read(provider);
    if (!credential) return [];
    if (credential.type === "api_key" && credential.key) return [credential.key];
    if (credential.type === "oauth") return [credential.access, credential.refresh].filter(Boolean) as string[];
    return [];
  } catch {
    return [];
  }
}

export async function runTestConnection(body: Record<string, unknown>, deps: SettingsDeps): Promise<TestConnectionResult> {
  const { models, credentials, testTimeoutMs } = deps;
  const { provider, modelId, thinkingLevel, model } = validateCustomRef(body, models);
  const controller = new AbortController();
  let timedOut = false;
  let timer!: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error(`test call exceeded ${testTimeoutMs}ms`));
    }, testTimeoutMs);
  });
  const startedAt = Date.now();
  try {
    await Promise.race([
      models.completeSimple(
        model,
        { messages: [{ role: "user", content: "ping", timestamp: Date.now() }] },
        {
          ...(thinkingLevel === "off" ? {} : { reasoning: thinkingLevel }),
          maxTokens: TEST_PROMPT_MAX_TOKENS,
          signal: controller.signal,
        },
      ),
      timeoutPromise,
    ]);
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const secrets = await collectKnownSecrets(credentials, provider);
    const hint = sanitizeAuthError(rawMessage, secrets);
    if (timedOut) {
      console.error(`settings: /ai/test timed out for ${provider}/${modelId}: ${hint}`);
      return { ok: false, status: 504, error: "timeout", hint };
    }
    console.error(`settings: /ai/test failed for ${provider}/${modelId}: ${hint}`);
    return { ok: false, status: 502, error: categorizeTestError(rawMessage), hint };
  } finally {
    clearTimeout(timer);
  }
}
