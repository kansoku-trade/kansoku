import type { MutableModels } from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { Body, Controller, Delete, Get, Param, Post, Put } from "@tsuki-hono/common";
import { getAiRuntime } from "../../ai/initAiSettings.js";
import type { AppCredentialStore } from "../../ai/credentialStore.js";
import { getModelsRuntime, SINGLE_KEY_PROVIDERS } from "../../ai/modelsRuntime.js";
import type { SecretBox } from "../../ai/secretBox.js";
import { type AiRole, getActiveSettingsStore, type SettingsStore } from "../../ai/settingsStore.js";
import { listUsage, type AiUsageRecord } from "../../ai/usageStore.js";
import { getDb, type Db } from "../../db/index.js";
import { ClientError } from "../../errors.js";
import {
  allowedProviders,
  categorizeTestError,
  CODEX_PROVIDER,
  parseRole,
  ROLES,
  sanitizeAuthError,
  validateCustomRef,
  validateRoleSetting,
} from "./settingsValidation.js";
import { easternDate } from "../../services/session.js";

const DEFAULT_TEST_TIMEOUT_MS = 25_000;
const TEST_PROMPT_MAX_TOKENS = 16;

export interface SettingsControllerDeps {
  settingsStore: SettingsStore;
  credentials: AppCredentialStore;
  secretBox: SecretBox;
  models: MutableModels;
  testTimeoutMs: number;
  db: Db;
}

let testDeps: Partial<SettingsControllerDeps> | null = null;

export function setSettingsDepsForTests(overrides: Partial<SettingsControllerDeps> | null): void {
  testDeps = overrides;
}

function deps(): SettingsControllerDeps {
  return {
    settingsStore: testDeps?.settingsStore ?? getActiveSettingsStore(),
    credentials: testDeps?.credentials ?? getAiRuntime().credentials,
    secretBox: testDeps?.secretBox ?? getAiRuntime().secretBox,
    models: testDeps?.models ?? getModelsRuntime(),
    testTimeoutMs: testDeps?.testTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
    db: testDeps?.db ?? getDb(),
  };
}

function usageRole(record: AiUsageRecord): "comment" | "analyst" | "deepDive" | "chat" | null {
  switch (record.layer) {
    case "commentator":
    case "event-filter":
      return "comment";
    case "analyst":
      return record.origin === "deep-dive" ? "deepDive" : "analyst";
    case "chat":
      return "chat";
    default:
      return null;
  }
}

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

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

@Controller("settings")
export class SettingsController {
  @Get("/ai")
  async getAi() {
    const { settingsStore, credentials, secretBox, models } = deps();
    const rolesOut = {} as Record<AiRole, ReturnType<SettingsStore["getRole"]> & { stale: boolean }>;
    for (const role of ROLES) {
      const setting = settingsStore.getRole(role);
      const stale = setting.mode === "custom" && !models.getModel(setting.provider ?? "", setting.modelId ?? "");
      rolesOut[role] = { ...setting, stale };
    }
    return {
      ok: true,
      data: { roles: rolesOut, credentials: credentials.list(), masterKey: secretBox.status() },
    };
  }

  @Put("/ai/roles/:role")
  async putRole(@Param("role") roleParam: string, @Body() body: Record<string, unknown> | null) {
    const { settingsStore, models } = deps();
    const role = parseRole(roleParam);
    const setting = validateRoleSetting(role, body ?? {}, models);
    settingsStore.setRole(role, setting);
    return { ok: true, data: { role, ...settingsStore.getRole(role) } };
  }

  @Delete("/ai/roles/:role")
  async deleteRole(@Param("role") roleParam: string) {
    const { settingsStore } = deps();
    const role = parseRole(roleParam);
    settingsStore.setRole(role, { mode: "disabled", provider: null, modelId: null, thinkingLevel: null });
    return { ok: true, data: { role, mode: "disabled" } };
  }

  @Put("/ai/credentials/:provider")
  async putCredential(@Param("provider") provider: string, @Body() body: { key?: unknown } | null) {
    const { credentials } = deps();
    if (provider === CODEX_PROVIDER) {
      throw new ClientError(`cannot set an api key for ${CODEX_PROVIDER}`, "managed by codex CLI login");
    }
    if (!SINGLE_KEY_PROVIDERS.has(provider)) {
      throw new ClientError(
        `unknown provider: ${provider}`,
        `expected one of ${[...SINGLE_KEY_PROVIDERS].join(", ")}`,
      );
    }
    const key = body?.key;
    if (typeof key !== "string" || !key) {
      throw new ClientError('"key" must be a non-empty string');
    }
    credentials.setApiKey(provider, key);
    const entry = credentials.list().find((e) => e.provider === provider);
    return { ok: true, data: { provider, masked: entry?.masked ?? null } };
  }

  @Delete("/ai/credentials/:provider")
  async deleteCredential(@Param("provider") provider: string) {
    const { credentials } = deps();
    try {
      await credentials.delete(provider);
    } catch (err) {
      const hint = provider === CODEX_PROVIDER ? "managed by codex CLI login" : undefined;
      throw new ClientError(err instanceof Error ? err.message : String(err), hint);
    }
    return { ok: true, data: { provider, deleted: true } };
  }

  @Get("/ai/catalog")
  async getCatalog() {
    const { credentials, models } = deps();
    const configuredApiKey = new Set(credentials.list().filter((e) => e.ok).map((e) => e.provider));
    const providers = [];
    for (const id of allowedProviders()) {
      const provider = models.getProvider(id);
      const name = provider?.name ?? id;
      const modelList = (provider?.getModels() ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        thinkingLevels: getSupportedThinkingLevels(m),
      }));

      let auth: { kind: "api_key" | "oauth"; status: "configured" | "missing" | "error" };
      if (id === CODEX_PROVIDER) {
        try {
          const credential = await credentials.read(CODEX_PROVIDER);
          auth = { kind: "oauth", status: credential ? "configured" : "missing" };
        } catch {
          auth = { kind: "oauth", status: "error" };
        }
      } else {
        auth = { kind: "api_key", status: configuredApiKey.has(id) ? "configured" : "missing" };
      }

      providers.push({ id, name, auth, models: modelList });
    }
    return { ok: true, data: { providers } };
  }

  @Post("/ai/test")
  async postTest(@Body() body: Record<string, unknown> | null) {
    const { models, credentials, testTimeoutMs } = deps();
    const { provider, modelId, thinkingLevel, model } = validateCustomRef(body ?? {}, models);
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
      return { ok: true, data: { latencyMs: Date.now() - startedAt } };
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const secrets = await collectKnownSecrets(credentials, provider);
      const hint = sanitizeAuthError(rawMessage, secrets);
      if (timedOut) {
        console.error(`settings: /ai/test timed out for ${provider}/${modelId}: ${hint}`);
        return jsonResponse(504, { ok: false, error: "timeout", hint });
      }
      console.error(`settings: /ai/test failed for ${provider}/${modelId}: ${hint}`);
      return jsonResponse(502, { ok: false, error: categorizeTestError(rawMessage), hint });
    } finally {
      clearTimeout(timer);
    }
  }

  @Get("/ai/usage-today")
  async getUsageToday() {
    const { db } = deps();
    const records = await listUsage(easternDate(new Date()), db);
    const roles = {
      comment: { calls: 0, cost: 0 },
      analyst: { calls: 0, cost: 0 },
      deepDive: { calls: 0, cost: 0 },
      chat: { calls: 0, cost: 0 },
    };
    const total = { calls: 0, cost: 0 };
    for (const record of records) {
      total.calls += record.calls;
      total.cost += record.cost_total;
      const role = usageRole(record);
      if (!role) continue;
      roles[role].calls += record.calls;
      roles[role].cost += record.cost_total;
    }
    return { ok: true, data: { roles, total } };
  }

  @Post("/ai/reset-credentials")
  async postResetCredentials() {
    const { db, credentials, secretBox } = deps();
    db.transaction(() => {
      credentials.wipeAll();
    });
    secretBox.resetKey();
    return { ok: true, data: { reset: true } };
  }
}
