import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiConfig } from "../src/ai/models.js";
import {
  createSettingsStore,
  getActiveSettingsStore,
  setActiveSettingsStore,
  type RoleSetting,
} from "../src/ai/settingsStore.js";
import { createDb } from "../src/db/index.js";

function tempDbPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "settings-store-"));
  return { dir, path: join(dir, "app.db") };
}

const realModel = builtinModels().getModels("anthropic")[0];

describe("createSettingsStore defaults", () => {
  it("returns documented defaults for missing rows and warns once per role", () => {
    const { dir, path } = tempDbPath();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = createDb(path);
      const store = createSettingsStore(db);
      for (const role of ["comment", "analyst", "deepDive", "chat"] as const) {
        expect(store.getRole(role)).toEqual({
          mode: "inherit",
          provider: null,
          modelId: null,
          thinkingLevel: null,
        });
      }
      expect(store.getRole("primary")).toEqual({
        mode: "disabled",
        provider: null,
        modelId: null,
        thinkingLevel: null,
      });
      expect(warn).toHaveBeenCalledTimes(5);
    } finally {
      warn.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("listRoles returns primary plus all four task roles", () => {
    const { dir, path } = tempDbPath();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = createDb(path);
      const store = createSettingsStore(db);
      const all = store.listRoles();
      expect(Object.keys(all).sort()).toEqual(["analyst", "chat", "comment", "deepDive", "primary"]);
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createSettingsStore setRole persistence", () => {
  it("persists custom setting and a new store instance over the same db file loads it", () => {
    const { dir, path } = tempDbPath();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db1 = createDb(path);
      const store1 = createSettingsStore(db1);
      const setting: RoleSetting = {
        mode: "custom",
        provider: realModel.provider,
        modelId: realModel.id,
        thinkingLevel: "medium",
      };
      store1.setRole("analyst", setting);
      expect(store1.getRole("analyst")).toEqual(setting);

      const db2 = createDb(path);
      const store2 = createSettingsStore(db2);
      expect(store2.getRole("analyst")).toEqual(setting);
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is immune to mutation of objects passed to setRole or returned by getRole", () => {
    const { dir, path } = tempDbPath();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = createDb(path);
      const store = createSettingsStore(db);
      const input: RoleSetting = {
        mode: "custom",
        provider: realModel.provider,
        modelId: realModel.id,
        thinkingLevel: "medium",
      };
      store.setRole("analyst", input);
      input.modelId = "mutated-input";

      const returned = store.getRole("analyst");
      returned.provider = "mutated-returned";

      expect(store.getRole("analyst")).toEqual({
        mode: "custom",
        provider: realModel.provider,
        modelId: realModel.id,
        thinkingLevel: "medium",
      });

      const listed = store.listRoles();
      listed.analyst.mode = "disabled";
      expect(store.getRole("analyst").mode).toBe("custom");
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("revision starts at 0 and increments per write", () => {
    const { dir, path } = tempDbPath();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = createDb(path);
      const store = createSettingsStore(db);
      expect(store.revision()).toBe(0);
      store.setRole("analyst", {
        mode: "custom",
        provider: realModel.provider,
        modelId: realModel.id,
        thinkingLevel: "medium",
      });
      expect(store.revision()).toBe(1);
      store.setRole("comment", { mode: "disabled", provider: null, modelId: null, thinkingLevel: null });
      expect(store.revision()).toBe(2);
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when setting mode inherit on the primary role and accepts it on task roles", () => {
    const { dir, path } = tempDbPath();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = createDb(path);
      const store = createSettingsStore(db);
      expect(() =>
        store.setRole("primary", { mode: "inherit", provider: null, modelId: null, thinkingLevel: null }),
      ).toThrow();
      expect(() =>
        store.setRole("comment", { mode: "inherit", provider: null, modelId: null, thinkingLevel: null }),
      ).not.toThrow();
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when mode custom is missing thinkingLevel", () => {
    const { dir, path } = tempDbPath();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = createDb(path);
      const store = createSettingsStore(db);
      expect(() =>
        store.setRole("analyst", {
          mode: "custom",
          provider: realModel.provider,
          modelId: realModel.id,
          thinkingLevel: null,
        }),
      ).toThrow();
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("nulls out provider/modelId/thinkingLevel in the DB for a disabled write", () => {
    const { dir, path } = tempDbPath();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = createDb(path);
      const store = createSettingsStore(db);
      store.setRole("analyst", {
        mode: "custom",
        provider: realModel.provider,
        modelId: realModel.id,
        thinkingLevel: "medium",
      });
      store.setRole("analyst", { mode: "disabled", provider: "should-be-ignored", modelId: "x", thinkingLevel: null });
      expect(store.getRole("analyst")).toEqual({
        mode: "disabled",
        provider: null,
        modelId: null,
        thinkingLevel: null,
      });

      const reloaded = createSettingsStore(createDb(path));
      expect(reloaded.getRole("analyst")).toEqual({
        mode: "disabled",
        provider: null,
        modelId: null,
        thinkingLevel: null,
      });
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("getActiveSettingsStore / setActiveSettingsStore", () => {
  afterEach(() => {
    setActiveSettingsStore(null);
  });

  it("throws with a clear message when unset", () => {
    setActiveSettingsStore(null);
    expect(() => getActiveSettingsStore()).toThrow(/settings store/i);
  });

  it("returns the store set via setActiveSettingsStore", () => {
    const { dir, path } = tempDbPath();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const store = createSettingsStore(createDb(path));
      setActiveSettingsStore(store);
      expect(getActiveSettingsStore()).toBe(store);
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("aiConfig integration with settingsStore", () => {
  let dir: string;

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    setActiveSettingsStore(null);
    vi.restoreAllMocks();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("resolves a custom role with thinkingLevel attached, and the result is a copy", () => {
    const tmp = tempDbPath();
    dir = tmp.dir;
    const store = createSettingsStore(createDb(tmp.path));
    store.setRole("analyst", {
      mode: "custom",
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: "medium",
    });
    setActiveSettingsStore(store);

    const config1 = aiConfig();
    expect(config1.analystModel?.id).toBe(realModel.id);
    expect(config1.analystModel?.thinkingLevel).toBe("medium");

    (config1.analystModel as { id: string }).id = "mutated";

    const config2 = aiConfig();
    expect(config2.analystModel?.id).toBe(realModel.id);
  });

  it("persists thinkingLevel off and aiConfig attaches it to the resolved model", () => {
    const tmp = tempDbPath();
    dir = tmp.dir;
    const store = createSettingsStore(createDb(tmp.path));
    store.setRole("analyst", {
      mode: "custom",
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: "off",
    });
    setActiveSettingsStore(store);

    expect(aiConfig().analystModel?.thinkingLevel).toBe("off");

    const reloaded = createSettingsStore(createDb(tmp.path));
    expect(reloaded.getRole("analyst")).toEqual({
      mode: "custom",
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: "off",
    });
  });

  it("returns null for custom mode pointing at a nonexistent model (stale)", () => {
    const tmp = tempDbPath();
    dir = tmp.dir;
    const store = createSettingsStore(createDb(tmp.path));
    store.setRole("analyst", {
      mode: "custom",
      provider: "anthropic",
      modelId: "does-not-exist-xyz",
      thinkingLevel: "medium",
    });
    setActiveSettingsStore(store);

    expect(aiConfig().analystModel).toBeNull();
  });

  it("inherit roles follow the primary model", () => {
    const tmp = tempDbPath();
    dir = tmp.dir;
    const store = createSettingsStore(createDb(tmp.path));
    store.setRole("primary", {
      mode: "custom",
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: "medium",
    });
    setActiveSettingsStore(store);

    const config = aiConfig();
    expect(config.chatModel).toEqual({ ...realModel, thinkingLevel: "medium" });
    expect(config.commentModel).toBe(config.chatModel);
    expect(config.analystModel).toBe(config.chatModel);
  });

  it("inherit roles resolve to null when primary is unset, and chat no longer follows analyst", () => {
    const tmp = tempDbPath();
    dir = tmp.dir;
    const store = createSettingsStore(createDb(tmp.path));
    store.setRole("analyst", {
      mode: "custom",
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: "medium",
    });
    setActiveSettingsStore(store);

    const config = aiConfig();
    expect(config.analystModel).not.toBeNull();
    expect(config.chatModel).toBeNull();
    expect(config.commentModel).toBeNull();
  });

  it("inherit roles resolve to null when primary points at a model no longer in the catalog", () => {
    const tmp = tempDbPath();
    dir = tmp.dir;
    const store = createSettingsStore(createDb(tmp.path));
    store.setRole("primary", {
      mode: "custom",
      provider: realModel.provider,
      modelId: "gone-model-xyz",
      thinkingLevel: "medium",
    });
    setActiveSettingsStore(store);

    expect(aiConfig().chatModel).toBeNull();
  });

  it("chat disabled returns null even while analyst is set", () => {
    const tmp = tempDbPath();
    dir = tmp.dir;
    const store = createSettingsStore(createDb(tmp.path));
    store.setRole("analyst", {
      mode: "custom",
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: "medium",
    });
    store.setRole("chat", { mode: "disabled", provider: null, modelId: null, thinkingLevel: null });
    setActiveSettingsStore(store);

    const config = aiConfig();
    expect(config.analystModel).not.toBeNull();
    expect(config.chatModel).toBeNull();
  });
});
