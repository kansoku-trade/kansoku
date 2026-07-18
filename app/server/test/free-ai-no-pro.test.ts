import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAiSettings, setAiRuntimeForTests } from "../../packages/core/src/ai/initAiSettings.js";
import { setModelsRuntimeForTests } from "../../packages/core/src/ai/modelsRuntime.js";
import { setActiveSettingsStore } from "../../packages/core/src/ai/settingsStore.js";
import {
  createWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from "../../packages/core/src/services/watchedMarketsStore.js";
import { createDb } from "../../packages/core/src/db/index.js";
import { unregisterProModuleForTests } from "../../packages/core/src/pro/registry.js";
import { tsukiRequest } from "./helpers.js";

describe("free AI settings without pro", () => {
  let dir: string;

  beforeEach(() => {
    unregisterProModuleForTests();
    setActiveSettingsStore(null);
    setAiRuntimeForTests(null);
    setModelsRuntimeForTests(null);
    dir = mkdtempSync(join(tmpdir(), "free-ai-no-pro-"));
    const db = createDb(join(dir, "app.db"));
    setActiveWatchedMarketsStore(createWatchedMarketsStore(db));
    initAiSettings(db, {});
  });

  afterEach(() => {
    setActiveSettingsStore(null);
    setAiRuntimeForTests(null);
    setModelsRuntimeForTests(null);
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves GET /api/settings/ai with pro absent", async () => {
    const res = await tsukiRequest("/api/settings/ai");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.credentials).toEqual([]);
    expect(body.data.roles.primary).toMatchObject({ mode: "disabled" });
  });
});
