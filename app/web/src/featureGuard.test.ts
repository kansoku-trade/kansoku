// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: null, licensed: false };

vi.mock("./capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } = await import("./licenseModalStore");
const { useLicenseGuard } = await import("./useLicenseGuard");

afterEach(() => {
  capabilities = { pro: null, licensed: false };
  resetLicenseModalStoreForTests();
});

describe("useLicenseGuard", () => {
  it("runs the action directly when licensed", () => {
    capabilities = { pro: true, licensed: true };
    const { result } = renderHook(() => useLicenseGuard());
    const action = vi.fn();

    result.current.guard(action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.locked).toBe(false);
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("opens the license modal instead of running the action when pro but unlicensed", () => {
    capabilities = { pro: true, licensed: false };
    const { result } = renderHook(() => useLicenseGuard());
    const action = vi.fn();

    result.current.guard(action);

    expect(action).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(true);
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });

  it("does nothing for a community build (pro:false)", () => {
    capabilities = { pro: false, licensed: false };
    const { result } = renderHook(() => useLicenseGuard());
    const action = vi.fn();

    result.current.guard(action);

    expect(action).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(false);
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("does nothing while capabilities are still loading (pro:null)", () => {
    capabilities = { pro: null, licensed: false };
    const { result } = renderHook(() => useLicenseGuard());
    const action = vi.fn();

    result.current.guard(action);

    expect(action).not.toHaveBeenCalled();
    expect(result.current.locked).toBe(false);
    expect(getLicenseModalStateForTests().open).toBe(false);
  });
});
