import { describe, expect, it } from "vitest";
import {
  DATA_DIR_ENV,
  SOURCE_CACHE_DIR_ENV,
  parseDatasetPathOptions,
} from "../../src/dataset/paths.js";

describe("dataset path resolution", () => {
  it("removes global path options and gives explicit paths precedence over the environment", () => {
    const parsed = parseDatasetPathOptions(
      [
        "score",
        "--dataset-dir",
        "/explicit/data",
        "--run-id",
        "run-1",
        "--source-cache-dir",
        "/explicit/sources",
      ],
      {
        [DATA_DIR_ENV]: "/environment/data",
        [SOURCE_CACHE_DIR_ENV]: "/environment/sources",
      },
      "/test/home",
    );

    expect(parsed.argv).toEqual(["score", "--run-id", "run-1"]);
    expect(parsed.datasetsRoot).toBe("/explicit/data");
    expect(parsed.sourceCacheRoot).toBe("/explicit/sources");
  });

  it("uses environment paths before the user-cache defaults", () => {
    const parsed = parseDatasetPathOptions(
      ["gold"],
      {
        [DATA_DIR_ENV]: "/environment/data",
        [SOURCE_CACHE_DIR_ENV]: "/environment/sources",
      },
      "/test/home",
    );

    expect(parsed.datasetsRoot).toBe("/environment/data");
    expect(parsed.sourceCacheRoot).toBe("/environment/sources");
  });

  it("defaults datasets and source caches to separate directories", () => {
    const parsed = parseDatasetPathOptions(["baseline"], {}, "/test/home");

    expect(parsed.datasetsRoot).toBe("/test/home/.cache/kansoku/bench/datasets");
    expect(parsed.sourceCacheRoot).toBe("/test/home/.cache/kansoku/bench/sources");
  });

  it("rejects a global path option without a value", () => {
    expect(() => parseDatasetPathOptions(["score", "--dataset-dir"], {}, "/test/home")).toThrow(
      "--dataset-dir requires a path",
    );
  });

  it("rejects nested data and source cache directories", () => {
    expect(() =>
      parseDatasetPathOptions(
        ["score", "--dataset-dir", "/bench", "--source-cache-dir", "/bench/sources"],
        {},
        "/test/home",
      ),
    ).toThrow("must be separate and non-nested");
  });
});
