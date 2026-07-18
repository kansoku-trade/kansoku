import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatasetManifest } from "../../src/dataset/manifest.js";
import { syncDataset } from "../../src/dataset/sync.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function manifestFor(payload: Buffer, sha256 = createHash("sha256").update(payload).digest("hex")): DatasetManifest {
  return {
    schemaVersion: 1,
    id: "demo",
    revision: "r1",
    kind: "single-shot",
    status: "pilot",
    modes: ["live"],
    cohort: "live-2026",
    visibility: "private",
    repository: "kansoku-trade/kansoku-bench-data",
    release: {
      tag: "dataset-demo-r1",
      asset: "kansoku-bench-demo-r1.tar.zst",
      sha256,
      sizeBytes: payload.byteLength,
      archiveRoot: "demo",
    },
    banks: { swing: 1 },
    generator: {
      repository: "kansoku-trade/kansoku",
      commit: "a".repeat(40),
    },
    publishedAt: "2026-07-18T00:00:00Z",
  };
}

describe("dataset synchronization", () => {
  it("verifies, installs atomically, and reuses an immutable installation", async () => {
    const root = await mkdtemp(join(tmpdir(), "bench-sync-"));
    temporaryRoots.push(root);
    const payload = Buffer.from("verified archive payload");
    const manifest = manifestFor(payload);
    const downloadRelease = vi.fn(async (_manifest: DatasetManifest, destination: string) => {
      await writeFile(destination, payload);
    });
    const extractArchive = vi.fn(async (_archive: string, destination: string) => {
      const bank = join(destination, "demo", "swing");
      await mkdir(bank, { recursive: true });
      await writeFile(join(bank, "case.json"), "{}", "utf8");
    });
    const dependencies = {
      loadManifest: async () => manifest,
      downloadRelease,
      extractArchive,
      now: () => new Date("2026-07-18T01:02:03Z"),
    };

    const first = await syncDataset({ id: "demo", datasetsRoot: root }, dependencies);
    const second = await syncDataset({ id: "demo", datasetsRoot: root }, dependencies);

    expect(first.status).toBe("installed");
    expect(second.status).toBe("present");
    expect(downloadRelease).toHaveBeenCalledTimes(1);
    expect(extractArchive).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(join(root, "demo", ".kansoku-dataset.json"), "utf8"))).toMatchObject({
      id: "demo",
      revision: "r1",
      sha256: manifest.release.sha256,
      installedAt: "2026-07-18T01:02:03.000Z",
      status: "pilot",
      modes: ["live"],
      cohort: "live-2026",
    });
  });

  it("rejects a checksum mismatch without leaving a partial dataset", async () => {
    const root = await mkdtemp(join(tmpdir(), "bench-sync-"));
    temporaryRoots.push(root);
    const payload = Buffer.from("tampered archive payload");
    const manifest = manifestFor(payload, "0".repeat(64));

    await expect(
      syncDataset(
        { id: "demo", datasetsRoot: root },
        {
          loadManifest: async () => manifest,
          downloadRelease: async (_manifest, destination) => writeFile(destination, payload),
        },
      ),
    ).rejects.toThrow(/checksum mismatch/);

    await expect(access(join(root, "demo"))).rejects.toThrow();
    expect((await readdir(root)).filter((entry) => entry.startsWith(".sync-"))).toEqual([]);
  });
});
