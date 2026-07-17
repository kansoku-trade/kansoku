import type { SecretBox } from "../../packages/core/src/ai/secretBox.js";
import { initAiSettings } from "../../packages/core/src/ai/initAiSettings.js";
import { getDb } from "../../packages/core/src/db/index.js";
import { loadDotenv } from "./dotenv.js";
import { registerBuiltinProServer } from "./pro/registerBuiltin.js";
import { initAuthUrlOpener, type AuthUrlOpener } from "../../packages/core/src/services/credentials/authUrlOpener.js";
import { initCredentialProvider } from "../../packages/core/src/services/credentials/registry.js";
import type { CredentialProvider } from "../../packages/core/src/services/credentials/types.js";

export interface ServerRuntimeOptions {
  credentialProvider?: CredentialProvider;
  secretBox?: SecretBox;
  openAuthUrl?: AuthUrlOpener;
}

export function initServerRuntime(opts?: ServerRuntimeOptions): void {
  loadDotenv();
  registerBuiltinProServer();

  // 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
  // default 5-min ephemeral TTL expires right at the boundary and misses.
  process.env.PI_CACHE_RETENTION ??= "long";

  initCredentialProvider(opts?.credentialProvider);
  initAuthUrlOpener(opts?.openAuthUrl);
  initAiSettings(getDb(), { secretBox: opts?.secretBox });
}
