import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLicenseSchedule } from "../src/license/licenseSchedule.js";
import type { LicenseManager } from "../src/license/licenseState.js";

function fakeManager(revalidate: () => Promise<void>): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: "unlicensed" }),
    getBundleKey: () => undefined,
    getBundleKeyId: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => {},
    revalidate,
  };
}

describe("licenseSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs an async first revalidate immediately on start without blocking", () => {
    const revalidate = vi.fn(async () => {});
    const schedule = createLicenseSchedule(fakeManager(revalidate));

    schedule.start();

    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it("never crashes when the first revalidate rejects", () => {
    const revalidate = vi.fn(async () => {
      throw new Error("network down");
    });
    const schedule = createLicenseSchedule(fakeManager(revalidate));

    expect(() => schedule.start()).not.toThrow();
  });

  it("re-runs revalidate every 24h", async () => {
    const revalidate = vi.fn(async () => {});
    const schedule = createLicenseSchedule(fakeManager(revalidate));

    schedule.start();
    expect(revalidate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(revalidate).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(revalidate).toHaveBeenCalledTimes(3);
  });

  it("stop clears the timer so no further revalidate runs", async () => {
    const revalidate = vi.fn(async () => {});
    const schedule = createLicenseSchedule(fakeManager(revalidate));

    schedule.start();
    schedule.stop();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it("start is idempotent: calling it twice does not create a second timer", async () => {
    const revalidate = vi.fn(async () => {});
    const schedule = createLicenseSchedule(fakeManager(revalidate));

    schedule.start();
    schedule.start();
    revalidate.mockClear();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(revalidate).toHaveBeenCalledTimes(1);
  });
});
