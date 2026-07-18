import { afterEach, describe, expect, it } from "vitest";
import {
  clearRestricted,
  dismissRestrictedBanner,
  getRestrictedModeSnapshotForTests,
  isCredentialsErrorCode,
  markRestricted,
  resetRestrictedModeForTests,
  subscribeForTests,
} from "./restrictedMode";

describe("isCredentialsErrorCode", () => {
  it("flags 503 NO_CREDENTIALS", () => {
    expect(isCredentialsErrorCode(503, "NO_CREDENTIALS")).toBe(true);
  });

  it("flags 503 CREDENTIALS_REJECTED", () => {
    expect(isCredentialsErrorCode(503, "CREDENTIALS_REJECTED")).toBe(true);
  });

  it("does not flag a 503 without a credentials code", () => {
    expect(isCredentialsErrorCode(503, "SOME_OTHER_CODE")).toBe(false);
    expect(isCredentialsErrorCode(503, undefined)).toBe(false);
  });

  it("does not flag a non-503 status even with a credentials code", () => {
    expect(isCredentialsErrorCode(400, "NO_CREDENTIALS")).toBe(false);
  });
});

describe("restricted mode store", () => {
  afterEach(() => {
    resetRestrictedModeForTests();
  });

  it("starts not restricted and not dismissed", () => {
    expect(getRestrictedModeSnapshotForTests()).toEqual({ restricted: false, dismissed: false });
  });

  it("markRestricted flips restricted and notifies subscribers once", () => {
    let notified = 0;
    const unsubscribe = subscribeForTests(() => notified++);
    markRestricted();
    expect(getRestrictedModeSnapshotForTests()).toEqual({ restricted: true, dismissed: false });
    expect(notified).toBe(1);
    markRestricted();
    expect(notified).toBe(1);
    unsubscribe();
  });

  it("dismissRestrictedBanner sets dismissed without clearing restricted", () => {
    markRestricted();
    dismissRestrictedBanner();
    expect(getRestrictedModeSnapshotForTests()).toEqual({ restricted: true, dismissed: true });
  });

  it("clearRestricted resets both restricted and dismissed", () => {
    markRestricted();
    dismissRestrictedBanner();
    clearRestricted();
    expect(getRestrictedModeSnapshotForTests()).toEqual({ restricted: false, dismissed: false });
  });
});
