import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "../src/db/index.js";
import { providerCredentials } from "../src/db/schema.js";
import { createCredentialStore, type AppCredentialStore } from "../src/ai/settings/credentialStore.js";
import { createSecretBox, type SecretBox } from "../src/ai/settings/secretBox.js";
import { createLicenseStore, type LicenseRecord } from "../src/license/licenseStore.js";
import {
  SINGLE_KEY_PROVIDERS,
  getModelsRuntime,
  initModelsRuntime,
  setModelsRuntimeForTests,
} from "../src/ai/runtime/modelsRuntime.js";

function jwt(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `head.${payload}.sig`;
}

describe("credentialStore", () => {
  let dir: string;
  let db: Db;
  let secretBox: SecretBox;
  let codexAuthPath: string;
  let store: AppCredentialStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "credential-store-"));
    db = createDb(join(dir, "app.db"));
    secretBox = createSecretBox(join(dir, "master.key"));
    codexAuthPath = join(dir, "auth.json");
    store = createCredentialStore(db, secretBox, { codexAuthPath });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("setApiKey then read returns the credential; list masks the tail; DB secret is encrypted", async () => {
    store.setApiKey("deepseek", "sk-real-1234");
    await expect(store.read("deepseek")).resolves.toEqual({ type: "api_key", key: "sk-real-1234" });

    const entries = store.listEntries();
    expect(entries).toEqual([
      expect.objectContaining({ provider: "deepseek", masked: "••••1234", ok: true }),
    ]);

    const row = db.select().from(providerCredentials).all()[0];
    expect(row.secret.startsWith("v1:")).toBe(true);
    expect(row.secret).not.toContain("sk-real-1234");
  });

  it("read for an unknown provider is undefined; delete removes; wipeAll empties", async () => {
    await expect(store.read("openai")).resolves.toBeUndefined();

    store.setApiKey("openai", "sk-abc");
    await expect(store.read("openai")).resolves.toBeDefined();
    await store.delete("openai");
    await expect(store.read("openai")).resolves.toBeUndefined();

    store.setApiKey("anthropic", "sk-a");
    store.setApiKey("openai", "sk-b");
    store.wipeAll();
    expect(store.listEntries()).toEqual([]);
  });

  it("logs a decrypt error once per provider and reports ok:false without plaintext", async () => {
    store.setApiKey("mistral", "sk-mistral");
    db.update(providerCredentials).set({ secret: "v1:garbage:garbage:garbage" }).run();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(store.read("mistral")).resolves.toBeUndefined();
    await expect(store.read("mistral")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    for (const call of errorSpy.mock.calls) {
      expect(call.join(" ")).not.toContain("sk-mistral");
    }
    errorSpy.mockRestore();

    const entries = store.listEntries();
    expect(entries).toEqual([
      { provider: "mistral", kind: "api_key", masked: null, ok: false, updatedAt: expect.any(String) },
    ]);
  });

  it("serializes concurrent modify calls per provider so the second sees the first's write", async () => {
    const order: string[] = [];
    const first = store.modify("deepseek", async (current) => {
      order.push("first-start");
      expect(current).toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first-end");
      return { type: "api_key", key: "sk-first" };
    });
    const second = store.modify("deepseek", async (current) => {
      order.push("second-start");
      expect(current).toEqual({ type: "api_key", key: "sk-first" });
      order.push("second-end");
      return { type: "api_key", key: "sk-second" };
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
    await expect(store.read("deepseek")).resolves.toEqual({ type: "api_key", key: "sk-second" });
  });

  describe("license record isolation", () => {
    const licenseRecord: LicenseRecord = {
      key: "lic_1234567890",
      instanceId: "lki_abc",
      deviceName: "my-mac",
      lastValidatedAt: "2026-07-01T00:00:00.000Z",
      lastOutcome: "success",
    };

    it("list() does not surface the reserved license row as a phantom credential", () => {
      createLicenseStore(db, secretBox).write(licenseRecord);
      store.setApiKey("deepseek", "sk-real-1234");

      const entries = store.listEntries();

      expect(entries).toEqual([expect.objectContaining({ provider: "deepseek" })]);
      expect(entries.some((e) => e.provider === "kansoku-license")).toBe(false);
    });

    it("wipeAll() clears provider credentials but leaves the license record intact", () => {
      const licenseStore = createLicenseStore(db, secretBox);
      licenseStore.write(licenseRecord);
      store.setApiKey("deepseek", "sk-real-1234");

      store.wipeAll();

      expect(store.listEntries()).toEqual([]);
      expect(licenseStore.read()).toEqual(licenseRecord);
    });
  });

  describe("codex adapter", () => {
    it("reads access/refresh/expires from the auth.json fixture", async () => {
      const expSeconds = 1_780_000_000;
      writeFileSync(
        codexAuthPath,
        JSON.stringify({
          auth_mode: "chatgpt",
          tokens: {
            access_token: jwt(expSeconds),
            refresh_token: "refresh-1",
            id_token: "id-1",
          },
          last_refresh: "2026-07-01T00:00:00.000Z",
        }),
      );

      const cred = await store.read("openai-codex");
      expect(cred).toEqual({
        type: "oauth",
        access: jwt(expSeconds),
        refresh: "refresh-1",
        expires: expSeconds * 1000,
      });
    });

    it("modify writes back access/refresh preserving extra fields and updates last_refresh", async () => {
      writeFileSync(
        codexAuthPath,
        JSON.stringify({
          auth_mode: "chatgpt",
          tokens: {
            access_token: jwt(1_000),
            refresh_token: "refresh-old",
            id_token: "id-1",
            account_id: "acct-1",
          },
          last_refresh: "2026-07-01T00:00:00.000Z",
        }),
      );

      const newExp = 1_900_000_000;
      const result = await store.modify("openai-codex", async (current) => {
        expect(current?.type).toBe("oauth");
        return { type: "oauth", access: jwt(newExp), refresh: "refresh-new", expires: newExp * 1000 };
      });
      expect(result).toEqual({ type: "oauth", access: jwt(newExp), refresh: "refresh-new", expires: newExp * 1000 });

      const saved = JSON.parse(readFileSync(codexAuthPath, "utf8"));
      expect(saved.tokens.access_token).toBe(jwt(newExp));
      expect(saved.tokens.refresh_token).toBe("refresh-new");
      expect(saved.tokens.id_token).toBe("id-1");
      expect(saved.tokens.account_id).toBe("acct-1");
      expect(saved.auth_mode).toBe("chatgpt");
      expect(saved.last_refresh).not.toBe("2026-07-01T00:00:00.000Z");
    });

    it("read is undefined when the auth file is missing", async () => {
      await expect(store.read("openai-codex")).resolves.toBeUndefined();
    });

    it("delete throws; setApiKey throws", async () => {
      await expect(store.delete("openai-codex")).rejects.toThrow();
      expect(() => store.setApiKey("openai-codex", "sk-x")).toThrow();
    });
  });
});

describe("modelsRuntime", () => {
  let dir: string;
  let db: Db;
  let secretBox: SecretBox;
  let store: AppCredentialStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "models-runtime-"));
    db = createDb(join(dir, "app.db"));
    secretBox = createSecretBox(join(dir, "master.key"));
    store = createCredentialStore(db, secretBox, { codexAuthPath: join(dir, "auth.json") });
    setModelsRuntimeForTests(null);
  });

  afterEach(() => {
    setModelsRuntimeForTests(null);
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws when uninitialized, and rejects double init", () => {
    expect(() => getModelsRuntime()).toThrow();
    initModelsRuntime(store);
    expect(getModelsRuntime()).toBeDefined();
    expect(() => initModelsRuntime(store)).toThrow();
  });

  it("never falls back to an ambient env var when the credential store has no entry", async () => {
    const originalEnv = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "sk-fake-env";
    try {
      const models = initModelsRuntime(store);
      const deepseek = models.getModel("deepseek", models.getModels("deepseek")[0]?.id ?? "");
      expect(deepseek).toBeDefined();
      if (!deepseek) throw new Error("no deepseek model in catalog");

      await expect(models.getAuth(deepseek)).resolves.toBeUndefined();

      store.setApiKey("deepseek", "sk-real");
      const auth = await models.getAuth(deepseek);
      expect(auth).toBeDefined();
      expect(auth?.auth.apiKey).toBe("sk-real");
    } finally {
      if (originalEnv === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalEnv;
    }
  });

  it("every SINGLE_KEY_PROVIDERS entry exists in the catalog with api-key auth", () => {
    const catalog = builtinModels();
    for (const providerId of SINGLE_KEY_PROVIDERS) {
      const provider = catalog.getProvider(providerId);
      expect(provider, `provider "${providerId}" missing from catalog`).toBeDefined();
      expect(provider?.auth.apiKey, `provider "${providerId}" has no api-key auth`).toBeTruthy();
    }
  });
});
