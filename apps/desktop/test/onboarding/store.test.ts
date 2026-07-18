import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOnboardingFileStore } from "@desktop/onboarding/store.js";

describe("createOnboardingFileStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "onboarding-store-"));
    path = join(dir, "onboarding-state.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports not-completed when the file is absent", async () => {
    const store = createOnboardingFileStore(path);
    expect(await store.getState()).toEqual({ completed: false });
  });

  it("persists completion and reads it back", async () => {
    const store = createOnboardingFileStore(path);
    expect(await store.complete()).toEqual({ completed: true });
    expect(await createOnboardingFileStore(path).getState()).toEqual({ completed: true });
  });

  it("treats a corrupt file as not-completed", async () => {
    await writeFile(path, "not json");
    expect(await createOnboardingFileStore(path).getState()).toEqual({ completed: false });
  });
});
