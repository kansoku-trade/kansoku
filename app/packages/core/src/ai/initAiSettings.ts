import { join } from "node:path";
import type { MutableModels } from "@earendil-works/pi-ai";
import { getEnvApiKey } from "@earendil-works/pi-ai/compat";
import { clampThinkingLevel } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { aiRoleSettings, appMeta, providerCredentials } from "../db/schema.js";
import { CHART_DATA_DIR } from "../env.js";
import { type AppCredentialStore, createCredentialStore } from "./credentialStore.js";
import { WebApiLobeHubCloudGateway } from "./lobehub/gateway.js";
import { createLobeHubProvider } from "./lobehub/provider.js";
import type { LobeHubCloudGateway } from "./lobehub/types.js";
import { initModelsRuntime, SINGLE_KEY_PROVIDERS } from "./modelsRuntime.js";
import { parseModelRef } from "./models.js";
import { createSecretBox, type SecretBox } from "./secretBox.js";
import { type AiTaskRole, createSettingsStore, setActiveSettingsStore } from "./settingsStore.js";
import { createWatchedMarketsStore, setActiveWatchedMarketsStore } from "./watchedMarketsStore.js";

export interface AiRuntime {
  secretBox: SecretBox;
  credentials: AppCredentialStore;
  lobehub: LobeHubCloudGateway;
}

let runtime: AiRuntime | null = null;

export function getAiRuntime(): AiRuntime {
  if (!runtime) {
    throw new Error("initAiSettings: ai runtime not initialized; call initAiSettings before use");
  }
  return runtime;
}

export function setAiRuntimeForTests(next: AiRuntime | null): void {
  runtime = next;
}

const ROLE_ENV_VARS: Record<AiTaskRole, string> = {
  comment: "AI_COMMENT_MODEL",
  analyst: "AI_ANALYST_MODEL",
  deepDive: "AI_DEEPDIVE_MODEL",
  chat: "AI_CHAT_MODEL",
};

const ROLES: AiTaskRole[] = ["comment", "analyst", "deepDive", "chat"];

const ENV_IMPORT_MARKER_KEY = "env_import_v1";
const ENV_IMPORT_MARKER_VALUE = "completed";
const PRIMARY_MARKER_KEY = "primary_model_v1";
const PRIMARY_ANCHOR_ORDER: AiTaskRole[] = ["analyst", "comment", "deepDive", "chat"];

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
          .onConflictDoUpdate({
            target: aiRoleSettings.role,
            set: { mode: "custom", provider: ref.provider, modelId: ref.id, thinkingLevel, updatedAt },
          })
          .run();
        importedProviders.add(ref.provider);
      } else {
        if (raw) console.warn(`initAiSettings: skipping unusable ${ROLE_ENV_VARS[role]}="${raw}"`);
        const mode = role === "chat" ? "inherit" : "disabled";
        tx.insert(aiRoleSettings)
          .values({ role, mode, provider: null, modelId: null, thinkingLevel: null, updatedAt })
          .onConflictDoUpdate({
            target: aiRoleSettings.role,
            set: { mode, provider: null, modelId: null, thinkingLevel: null, updatedAt },
          })
          .run();
      }
    }

    for (const provider of importedProviders) {
      if (!SINGLE_KEY_PROVIDERS.has(provider)) continue;
      const key = getEnvApiKey(provider, env as Record<string, string>);
      if (!key || key === "<authenticated>") continue;
      const secret = secretBox.encrypt(provider, JSON.stringify({ type: "api_key", key }));
      tx.insert(providerCredentials)
        .values({ provider, secret, updatedAt })
        .onConflictDoUpdate({ target: providerCredentials.provider, set: { secret, updatedAt } })
        .run();
    }

    tx.insert(appMeta)
      .values({ key: ENV_IMPORT_MARKER_KEY, value: ENV_IMPORT_MARKER_VALUE })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: ENV_IMPORT_MARKER_VALUE } })
      .run();
  });
}

export function runPrimaryModelMigration(db: Db): void {
  const marker = db.select().from(appMeta).where(eq(appMeta.key, PRIMARY_MARKER_KEY)).get();
  if (marker?.value === ENV_IMPORT_MARKER_VALUE) return;

  db.transaction((tx) => {
    const updatedAt = new Date().toISOString();
    const rows = tx.select().from(aiRoleSettings).all();
    const byRole = new Map(rows.map((row) => [row.role, row]));

    const anchorRole = PRIMARY_ANCHOR_ORDER.find((role) => byRole.get(role)?.mode === "custom");
    const anchor = anchorRole ? byRole.get(anchorRole) : undefined;

    const primary = anchor
      ? {
          mode: "custom",
          provider: anchor.provider,
          modelId: anchor.modelId,
          thinkingLevel: anchor.thinkingLevel,
        }
      : { mode: "disabled", provider: null, modelId: null, thinkingLevel: null };

    tx.insert(aiRoleSettings)
      .values({ role: "primary", ...primary, updatedAt })
      .onConflictDoUpdate({ target: aiRoleSettings.role, set: { ...primary, updatedAt } })
      .run();

    if (anchor) {
      for (const row of rows) {
        if (row.role === "primary" || row.mode !== "custom") continue;
        const matches =
          row.provider === anchor.provider &&
          row.modelId === anchor.modelId &&
          row.thinkingLevel === anchor.thinkingLevel;
        if (!matches) continue;
        tx.update(aiRoleSettings)
          .set({ mode: "inherit", provider: null, modelId: null, thinkingLevel: null, updatedAt })
          .where(eq(aiRoleSettings.role, row.role))
          .run();
      }
    }

    tx.insert(appMeta)
      .values({ key: PRIMARY_MARKER_KEY, value: ENV_IMPORT_MARKER_VALUE })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: ENV_IMPORT_MARKER_VALUE } })
      .run();
  });
}

export function initAiSettings(
  db: Db,
  opts?: { env?: NodeJS.ProcessEnv; secretBox?: SecretBox; codexAuthPath?: string; fetch?: typeof globalThis.fetch },
): { models: MutableModels } {
  const box = opts?.secretBox ?? createSecretBox(join(CHART_DATA_DIR, "ai-secret.key"));
  runEnvImport(db, box, opts?.env ?? process.env);
  runPrimaryModelMigration(db);
  setActiveSettingsStore(createSettingsStore(db));
  setActiveWatchedMarketsStore(createWatchedMarketsStore(db));
  const credentials = createCredentialStore(db, box, { codexAuthPath: opts?.codexAuthPath });
  const models = initModelsRuntime(credentials);
  const env = opts?.env ?? process.env;
  const lobehub = new WebApiLobeHubCloudGateway({
    baseUrl: env.LOBEHUB_CLOUD_URL || "https://app.lobehub.com",
    clientId: env.LOBEHUB_OAUTH_CLIENT_ID || "lca_KhxAC5GNLjUTaArHuKx406Ck",
    credentials,
    fetch: opts?.fetch,
  });
  models.setProvider(createLobeHubProvider(lobehub));
  if (opts?.fetch || process.env.NODE_ENV !== "test") {
    void models.refresh("lobehub").catch((error) => {
      console.warn(`initAiSettings: failed to load LobeHub Cloud models: ${String(error)}`);
    });
  }
  runtime = { secretBox: box, credentials, lobehub };
  return { models };
}
