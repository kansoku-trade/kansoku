import { join } from "node:path";
import type { MutableModels } from "@earendil-works/pi-ai";
import { getEnvApiKey } from "@earendil-works/pi-ai/compat";
import { clampThinkingLevel } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { aiRoleSettings, appMeta, providerCredentials } from "../db/schema.js";
import { CHART_DATA_DIR } from "../env.js";
import { createCredentialStore } from "./credentialStore.js";
import { initModelsRuntime, SINGLE_KEY_PROVIDERS } from "./modelsRuntime.js";
import { parseModelRef } from "./models.js";
import { createSecretBox, type SecretBox } from "./secretBox.js";
import { type AiRole, createSettingsStore, setActiveSettingsStore } from "./settingsStore.js";

const ROLE_ENV_VARS: Record<AiRole, string> = {
  comment: "AI_COMMENT_MODEL",
  analyst: "AI_ANALYST_MODEL",
  deepDive: "AI_DEEPDIVE_MODEL",
  chat: "AI_CHAT_MODEL",
};

const ROLES: AiRole[] = ["comment", "analyst", "deepDive", "chat"];

const ENV_IMPORT_MARKER_KEY = "env_import_v1";
const ENV_IMPORT_MARKER_VALUE = "completed";

const catalog = builtinModels();

export function runEnvImport(db: Db, secretBox: SecretBox, env: NodeJS.ProcessEnv): void {
  const marker = db.select().from(appMeta).where(eq(appMeta.key, ENV_IMPORT_MARKER_KEY)).get();
  if (marker?.value === ENV_IMPORT_MARKER_VALUE) return;

  db.transaction((tx) => {
    const updatedAt = new Date().toISOString();
    const importedProviders = new Set<string>();

    for (const role of ROLES) {
      const raw = env[ROLE_ENV_VARS[role]];
      const ref = raw ? parseModelRef(raw) : null;
      const model = ref ? catalog.getModel(ref.provider, ref.id) : undefined;

      if (ref && model) {
        const thinkingLevel = clampThinkingLevel(model, ref.thinkingLevel ?? "off");
        tx.insert(aiRoleSettings)
          .values({ role, mode: "custom", provider: ref.provider, modelId: ref.id, thinkingLevel, updatedAt })
          .run();
        importedProviders.add(ref.provider);
      } else {
        if (raw) console.warn(`initAiSettings: skipping unusable ${ROLE_ENV_VARS[role]}="${raw}"`);
        tx.insert(aiRoleSettings)
          .values({
            role,
            mode: role === "chat" ? "inherit" : "disabled",
            provider: null,
            modelId: null,
            thinkingLevel: null,
            updatedAt,
          })
          .run();
      }
    }

    for (const provider of importedProviders) {
      if (!SINGLE_KEY_PROVIDERS.has(provider)) continue;
      const key = getEnvApiKey(provider, env as Record<string, string>);
      if (!key || key === "<authenticated>") continue;
      const secret = secretBox.encrypt(provider, JSON.stringify({ type: "api_key", key }));
      tx.insert(providerCredentials).values({ provider, secret, updatedAt }).run();
    }

    tx.insert(appMeta).values({ key: ENV_IMPORT_MARKER_KEY, value: ENV_IMPORT_MARKER_VALUE }).run();
  });
}

export function initAiSettings(
  db: Db,
  opts?: { env?: NodeJS.ProcessEnv; secretBox?: SecretBox; codexAuthPath?: string },
): { models: MutableModels } {
  const box = opts?.secretBox ?? createSecretBox(join(CHART_DATA_DIR, "ai-secret.key"));
  runEnvImport(db, box, opts?.env ?? process.env);
  setActiveSettingsStore(createSettingsStore(db));
  const models = initModelsRuntime(createCredentialStore(db, box, { codexAuthPath: opts?.codexAuthPath }));
  return { models };
}
