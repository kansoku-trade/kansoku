import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDataRootFileStore } from "@desktop/dataRoot/store.js";

describe("createDataRootFileStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "data-root-store-"));
    path = join(dir, "data-root.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("defaults to path null when the file is absent", async () => {
    const store = createDataRootFileStore(path);
    expect(await store.get()).toEqual({ path: null });
  });

  it("persists an absolute path and reads it back", async () => {
    const store = createDataRootFileStore(path);
    await store.setPath("/Users/me/git/trade");
    expect(await store.get()).toEqual({ path: "/Users/me/git/trade" });
    expect(await createDataRootFileStore(path).get()).toEqual({ path: "/Users/me/git/trade" });
  });

  it("clear writes path null and subsequent get returns null", async () => {
    const store = createDataRootFileStore(path);
    await store.setPath("/Users/me/git/trade");
    await store.clear();
    expect(await store.get()).toEqual({ path: null });
    const raw = await readFile(path, "utf8");
    expect(JSON.parse(raw)).toEqual({ path: null });
  });

  it("treats a corrupt file as path null", async () => {
    await writeFile(path, "not json");
    expect(await createDataRootFileStore(path).get()).toEqual({ path: null });
  });

  it("treats a missing path field as null", async () => {
    await writeFile(path, JSON.stringify({ other: true }));
    expect(await createDataRootFileStore(path).get()).toEqual({ path: null });
  });
});
