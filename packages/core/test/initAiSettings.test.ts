import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAiSettings, runEnvImport, runPrimaryModelMigration } from "../src/ai/initAiSettings.js";
import { aiConfig } from "../src/ai/models.js";
import { getModelsRuntime, setModelsRuntimeForTests } from "../src/ai/modelsRuntime.js";
import { createSecretBox, type SecretBox } from "../src/ai/secretBox.js";
import { setActiveSettingsStore } from "../src/ai/settingsStore.js";
import { createDb, type Db } from "../src/db/index.js";
import { aiRoleSettings, appMeta, providerCredentials } from "../src/db/schema.js";

const catalog = builtinModels();
const analystModel = catalog.getModels("anthropic").find((m) => m.id === "claude-sonnet-4-5");
if (!analystModel) throw new Error("fixture model anthropic/claude-sonnet-4-5 not in catalog");

function tempDb(): { dir: string; db: Db } {
  const dir = mkdtempSync(join(tmpdir(), "init-ai-settings-"));
  return { dir, db: createDb(join(dir, "app.db")) };
}

function tempSecretBox(dir: string): SecretBox {
  return createSecretBox(join(dir, "master.key"));
}

describe("runEnvImport", () => {
  let dir: string;
  let db: Db;
  let secretBox: SecretBox;

  beforeEach(() => {
    const t = tempDb();
    dir = t.dir;
    db = t.db;
    secretBox = tempSecretBox(dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("imports a parseable role, defaults the rest, imports the matching credential, writes the marker", () => {
    runEnvImport(db, secretBox, { AI_ANALYST_MODEL: "anthropic/claude-sonnet-4-5", ANTHROPIC_API_KEY: "sk-test" });

    const rows = new Map(db.select().from(aiRoleSettings).all().map((r) => [r.role, r]));
    expect(rows.get("analyst")).toMatchObject({
      mode: "custom",
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
      thinkingLevel: "off",
    });
    expect(rows.get("chat")).toMatchObject({ mode: "inherit", provider: null, modelId: null, thinkingLevel: null });
    expect(rows.get("comment")).toMatchObject({ mode: "disabled", provider: null, modelId: null, thinkingLevel: null });
    expect(rows.get("deepDive")).toMatchObject({
      mode: "disabled",
      provider: null,
      modelId: null,
      thinkingLevel: null,
    });

    const credRow = db.select().from(providerCredentials).where(eq(providerCredentials.provider, "anthropic")).get();
    expect(credRow).toBeDefined();
    if (!credRow) throw new Error("unreachable");
    expect(JSON.parse(secretBox.decrypt("anthropic", credRow.secret))).toEqual({ type: "api_key", key: "sk-test" });

    const marker = db.select().from(appMeta).where(eq(appMeta.key, "env_import_v1")).get();
    expect(marker?.value).toBe("completed");
  });

  it("clamps a :high thinkingLevel suffix into the model's supported set", () => {
    runEnvImport(db, secretBox, { AI_ANALYST_MODEL: "anthropic/claude-sonnet-4-5:high" });

    const row = db.select().from(aiRoleSettings).where(eq(aiRoleSettings.role, "analyst")).get();
    expect(row?.thinkingLevel).toBe("high");
  });

  it("disables a role with an unparseable model string, warns, and still writes the marker", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    runEnvImport(db, secretBox, { AI_ANALYST_MODEL: "garbage" });

    const row = db.select().from(aiRoleSettings).where(eq(aiRoleSettings.role, "analyst")).get();
    expect(row).toMatchObject({ mode: "disabled", provider: null, modelId: null, thinkingLevel: null });
    expect(warn).toHaveBeenCalled();

    const marker = db.select().from(appMeta).where(eq(appMeta.key, "env_import_v1")).get();
    expect(marker?.value).toBe("completed");
  });

  it("does nothing when the marker is already present, even with empty tables", () => {
    db.insert(appMeta).values({ key: "env_import_v1", value: "completed" }).run();

    runEnvImport(db, secretBox, { AI_ANALYST_MODEL: "anthropic/claude-sonnet-4-5", ANTHROPIC_API_KEY: "sk-test" });

    expect(db.select().from(aiRoleSettings).all()).toEqual([]);
    expect(db.select().from(providerCredentials).all()).toEqual([]);
  });

  it("skips the credential import when the env key is the literal <authenticated> marker", () => {
    runEnvImport(db, secretBox, {
      AI_ANALYST_MODEL: "anthropic/claude-sonnet-4-5",
      ANTHROPIC_API_KEY: "<authenticated>",
    });

    expect(db.select().from(providerCredentials).all()).toEqual([]);
    const row = db.select().from(aiRoleSettings).where(eq(aiRoleSettings.role, "analyst")).get();
    expect(row).toMatchObject({ mode: "custom", provider: "anthropic", modelId: "claude-sonnet-4-5" });
  });

  it("imports over pre-existing rows when tables are non-empty but the marker is missing", () => {
    db.insert(aiRoleSettings)
      .values({ role: "analyst", mode: "disabled", provider: null, modelId: null, thinkingLevel: null, updatedAt: "stale" })
      .run();
    db.insert(appMeta).values({ key: "env_import_v1", value: "in-progress" }).run();

    runEnvImport(db, secretBox, { AI_ANALYST_MODEL: "anthropic/claude-sonnet-4-5", ANTHROPIC_API_KEY: "sk-test" });

    const row = db.select().from(aiRoleSettings).where(eq(aiRoleSettings.role, "analyst")).get();
    expect(row).toMatchObject({
      mode: "custom",
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
      thinkingLevel: "off",
    });

    const credRow = db.select().from(providerCredentials).where(eq(providerCredentials.provider, "anthropic")).get();
    expect(credRow).toBeDefined();

    const marker = db.select().from(appMeta).where(eq(appMeta.key, "env_import_v1")).get();
    expect(marker?.value).toBe("completed");
  });

  it("rolls back the whole transaction when secretBox.encrypt throws", () => {
    const brokenSecretBox = {
      status: () => "ready",
      encrypt: () => {
        throw new Error("encrypt boom");
      },
      decrypt: () => {
        throw new Error("unused");
      },
      resetKey: () => {},
    } as unknown as SecretBox;

    expect(() =>
      runEnvImport(db, brokenSecretBox, {
        AI_ANALYST_MODEL: "anthropic/claude-sonnet-4-5",
        ANTHROPIC_API_KEY: "sk-test",
      }),
    ).toThrow("encrypt boom");

    expect(db.select().from(aiRoleSettings).all()).toEqual([]);
    expect(db.select().from(appMeta).all()).toEqual([]);
  });
});

describe("initAiSettings", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    const t = tempDb();
    dir = t.dir;
    db = t.db;
    setModelsRuntimeForTests(null);
  });

  afterEach(() => {
    setActiveSettingsStore(null);
    setModelsRuntimeForTests(null);
    rmSync(dir, { recursive: true, force: true });
  });

  it("imports env, activates the settings store, and initializes the models runtime", () => {
    const secretBox = tempSecretBox(dir);
    const { models } = initAiSettings(db, {
      env: { AI_ANALYST_MODEL: "anthropic/claude-sonnet-4-5", ANTHROPIC_API_KEY: "sk-test" },
      secretBox,
      codexAuthPath: join(dir, "auth.json"),
    });

    expect(aiConfig().analystModel?.id).toBe(analystModel.id);
    expect(aiConfig().analystModel?.thinkingLevel).toBe("off");
    expect(getModelsRuntime()).toBe(models);
  });
});

describe("runPrimaryModelMigration", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    const t = tempDb();
    dir = t.dir;
    db = t.db;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function insertRole(role: string, mode: string, provider: string | null, modelId: string | null, thinkingLevel: string | null) {
    db.insert(aiRoleSettings)
      .values({ role, mode, provider, modelId, thinkingLevel, updatedAt: new Date().toISOString() })
      .run();
  }

  function roleRows() {
    return new Map(db.select().from(aiRoleSettings).all().map((r) => [r.role, r]));
  }

  it("collapses identical custom rows into primary + inherit", () => {
    for (const role of ["comment", "analyst", "deepDive"]) {
      insertRole(role, "custom", "anthropic", "claude-sonnet-4-5", "off");
    }
    insertRole("chat", "inherit", null, null, null);

    runPrimaryModelMigration(db);

    const rows = roleRows();
    expect(rows.get("primary")).toMatchObject({
      mode: "custom",
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
      thinkingLevel: "off",
    });
    for (const role of ["comment", "analyst", "deepDive", "chat"]) {
      expect(rows.get(role)).toMatchObject({ mode: "inherit", provider: null, modelId: null, thinkingLevel: null });
    }
    const marker = db.select().from(appMeta).where(eq(appMeta.key, "primary_model_v1")).get();
    expect(marker?.value).toBe("completed");
  });

  it("keeps custom rows whose config differs from the anchor", () => {
    insertRole("analyst", "custom", "anthropic", "claude-sonnet-4-5", "off");
    insertRole("comment", "custom", "anthropic", "claude-sonnet-4-5", "high");
    insertRole("deepDive", "disabled", null, null, null);

    runPrimaryModelMigration(db);

    const rows = roleRows();
    expect(rows.get("primary")).toMatchObject({ mode: "custom", modelId: "claude-sonnet-4-5", thinkingLevel: "off" });
    expect(rows.get("analyst")).toMatchObject({ mode: "inherit" });
    expect(rows.get("comment")).toMatchObject({ mode: "custom", thinkingLevel: "high" });
    expect(rows.get("deepDive")).toMatchObject({ mode: "disabled" });
  });

  it("writes a disabled primary when no custom row exists", () => {
    insertRole("comment", "disabled", null, null, null);
    insertRole("chat", "inherit", null, null, null);

    runPrimaryModelMigration(db);

    expect(roleRows().get("primary")).toMatchObject({
      mode: "disabled",
      provider: null,
      modelId: null,
      thinkingLevel: null,
    });
    expect(roleRows().get("comment")).toMatchObject({ mode: "disabled" });
  });

  it("is a no-op when the marker is present", () => {
    db.insert(appMeta).values({ key: "primary_model_v1", value: "completed" }).run();
    insertRole("analyst", "custom", "anthropic", "claude-sonnet-4-5", "off");

    runPrimaryModelMigration(db);

    expect(roleRows().has("primary")).toBe(false);
    expect(roleRows().get("analyst")).toMatchObject({ mode: "custom" });
  });

  it("runs after env import inside initAiSettings so a fresh boot lands on primary + inherit", () => {
    const secretBox = tempSecretBox(dir);
    try {
      initAiSettings(db, {
        env: { AI_ANALYST_MODEL: "anthropic/claude-sonnet-4-5", ANTHROPIC_API_KEY: "sk-test" },
        secretBox,
        codexAuthPath: join(dir, "codex-auth.json"),
      });
      const rows = roleRows();
      expect(rows.get("primary")).toMatchObject({ mode: "custom", modelId: "claude-sonnet-4-5" });
      expect(rows.get("analyst")).toMatchObject({ mode: "inherit" });
      const config = aiConfig();
      expect(config.analystModel?.id).toBe("claude-sonnet-4-5");
      expect(config.chatModel).toBe(config.analystModel);
      expect(config.commentModel).toBeNull();
    } finally {
      setActiveSettingsStore(null);
      setModelsRuntimeForTests(null);
    }
  });
});
