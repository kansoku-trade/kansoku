import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_DISPLAY_PREFERENCE,
  readTimeDisplayPreference,
  TIME_DISPLAY_PREFERENCE_STORAGE_KEY,
} from "./timeDisplayPreference";

describe("time display preference persistence", () => {
  it("defaults to Eastern Time when no valid preference is stored", () => {
    expect(readTimeDisplayPreference(null)).toBe(DEFAULT_TIME_DISPLAY_PREFERENCE);
    expect(readTimeDisplayPreference({ getItem: () => "unexpected" })).toBe("market");
  });

  it("restores the local-first preference from browser storage", () => {
    const storage = {
      getItem: (key: string) => (key === TIME_DISPLAY_PREFERENCE_STORAGE_KEY ? "local" : null),
    };

    expect(readTimeDisplayPreference(storage)).toBe("local");
  });
});
