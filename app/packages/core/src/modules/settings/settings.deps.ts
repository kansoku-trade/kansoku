import type { MutableModels } from "@earendil-works/pi-ai";
import type { AppCredentialStore } from "../../ai/credentialStore.js";
import type { LobeHubAccount } from "../../ai/lobehub/types.js";
import { getAiRuntime } from "../../ai/initAiSettings.js";
import { getModelsRuntime } from "../../ai/modelsRuntime.js";
import type { SecretBox } from "../../ai/secretBox.js";
import { getActiveSettingsStore, type SettingsStore } from "../../ai/settingsStore.js";
import { getActiveWatchedMarketsStore, type WatchedMarketsStore } from "../../services/watchedMarketsStore.js";
import { getDb, type Db } from "../../db/index.js";

const DEFAULT_TEST_TIMEOUT_MS = 25_000;

export interface SettingsDeps {
  settingsStore: SettingsStore;
  watchedMarketsStore: WatchedMarketsStore;
  credentials: AppCredentialStore;
  secretBox: SecretBox;
  models: MutableModels;
  testTimeoutMs: number;
  db: Db;
  lobehub: { getAccount(): Promise<LobeHubAccount> };
}

let testDeps: Partial<SettingsDeps> | null = null;

const testLobeHubFallback: SettingsDeps["lobehub"] = {
  async getAccount() {
    return {
      status: "unavailable",
      email: null,
      name: null,
      userId: null,
      updatedAt: null,
      baseUrl: "https://app.lobehub.com",
    };
  },
};

export function setSettingsDepsForTests(overrides: Partial<SettingsDeps> | null): void {
  testDeps = overrides;
}

export function settingsDeps(): SettingsDeps {
  return {
    settingsStore: testDeps?.settingsStore ?? getActiveSettingsStore(),
    watchedMarketsStore: testDeps?.watchedMarketsStore ?? getActiveWatchedMarketsStore(),
    credentials: testDeps?.credentials ?? getAiRuntime().credentials,
    secretBox: testDeps?.secretBox ?? getAiRuntime().secretBox,
    models: testDeps?.models ?? getModelsRuntime(),
    testTimeoutMs: testDeps?.testTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
    db: testDeps?.db ?? getDb(),
    lobehub: testDeps?.lobehub ?? (testDeps ? testLobeHubFallback : getAiRuntime().lobehub),
  };
}
