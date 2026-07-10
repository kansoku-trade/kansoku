import { describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  isNewerVersion,
  parseLatestRelease,
  shouldCheck,
  type UpdaterDeps,
} from "../src/updater.js";

describe("isNewerVersion", () => {
  it.each([
    ["1.0.0", "1.0.1", true],
    ["1.0.0", "1.0.0", false],
    ["1.2.0", "1.1.9", false],
    ["v1.0.0", "1.0.1", true],
    ["1.0.0", "v1.0.1", true],
    ["desktop-v1.0.0", "desktop-v1.0.1", true],
    ["desktop-v1.0.1", "1.0.0", false],
    ["1.0.0", "not-a-version", false],
    ["garbage", "1.0.0", true],
    ["1.0", "1.0.1", true],
    ["1.0.0", "1.0.0.1", true],
  ])("isNewerVersion(%s, %s) -> %s", (current, latest, expected) => {
    expect(isNewerVersion(current, latest)).toBe(expected);
  });
});

describe("shouldCheck", () => {
  const now = "2026-07-11T12:00:00.000Z";

  it("checks when there is no prior record", () => {
    expect(shouldCheck(null, now)).toBe(true);
  });

  it("checks when the record is malformed", () => {
    expect(shouldCheck("not-a-date", now)).toBe(true);
  });

  it("does not check inside 24h", () => {
    const last = "2026-07-10T12:00:01.000Z"; // 23h59m59s ago
    expect(shouldCheck(last, now)).toBe(false);
  });

  it("checks once past 24h", () => {
    const last = "2026-07-10T11:58:59.000Z"; // 24h01m ago
    expect(shouldCheck(last, now)).toBe(true);
  });
});

describe("parseLatestRelease", () => {
  it("parses a normal release payload", () => {
    expect(
      parseLatestRelease({
        tag_name: "desktop-v1.2.3",
        html_url: "https://github.com/Innei/trade-skills/releases/tag/desktop-v1.2.3",
        draft: false,
      }),
    ).toEqual({
      version: "desktop-v1.2.3",
      htmlUrl: "https://github.com/Innei/trade-skills/releases/tag/desktop-v1.2.3",
    });
  });

  it("rejects a draft release", () => {
    expect(
      parseLatestRelease({ tag_name: "v1.0.0", html_url: "https://x", draft: true }),
    ).toBeNull();
  });

  it("rejects a payload missing html_url", () => {
    expect(parseLatestRelease({ tag_name: "v1.0.0" })).toBeNull();
  });

  it("rejects a payload missing tag_name", () => {
    expect(parseLatestRelease({ html_url: "https://x" })).toBeNull();
  });

  it("rejects null", () => {
    expect(parseLatestRelease(null)).toBeNull();
  });

  it("rejects a non-object (e.g. 404 body)", () => {
    expect(parseLatestRelease({ message: "Not Found" })).toBeNull();
  });

  it("rejects malformed shapes", () => {
    expect(parseLatestRelease("not json")).toBeNull();
    expect(parseLatestRelease(42)).toBeNull();
  });
});

function makeDeps(overrides: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    currentVersion: "1.0.0",
    now: () => "2026-07-11T12:00:00.000Z",
    fetchJson: vi.fn().mockResolvedValue({
      tag_name: "desktop-v1.1.0",
      html_url: "https://github.com/Innei/trade-skills/releases/tag/desktop-v1.1.0",
      draft: false,
    }),
    readLastCheck: vi.fn().mockResolvedValue(null),
    writeLastCheck: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    ...overrides,
  };
}

describe("checkForUpdate", () => {
  it("notifies when a newer release exists and persists the check timestamp", async () => {
    const deps = makeDeps();
    await checkForUpdate(deps);
    expect(deps.notify).toHaveBeenCalledWith({
      version: "desktop-v1.1.0",
      htmlUrl: "https://github.com/Innei/trade-skills/releases/tag/desktop-v1.1.0",
    });
    expect(deps.writeLastCheck).toHaveBeenCalledWith("2026-07-11T12:00:00.000Z");
  });

  it("skips the network call entirely when the throttle blocks it", async () => {
    const deps = makeDeps({ readLastCheck: vi.fn().mockResolvedValue("2026-07-11T00:00:01.000Z") });
    await checkForUpdate(deps);
    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("does not notify when the latest release is not newer", async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({
        tag_name: "desktop-v1.0.0",
        html_url: "https://x",
        draft: false,
      }),
    });
    await checkForUpdate(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.writeLastCheck).toHaveBeenCalled();
  });

  it("stays silent when the fetch rejects (offline / rate-limit)", async () => {
    const deps = makeDeps({ fetchJson: vi.fn().mockRejectedValue(new Error("network down")) });
    await expect(checkForUpdate(deps)).resolves.toBeUndefined();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("stays silent when the response parses to null (404 / draft-only repo)", async () => {
    const deps = makeDeps({ fetchJson: vi.fn().mockResolvedValue({ message: "Not Found" }) });
    await checkForUpdate(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.writeLastCheck).toHaveBeenCalled();
  });
});
