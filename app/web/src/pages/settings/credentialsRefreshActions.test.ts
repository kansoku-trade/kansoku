import { describe, expect, it, vi } from "vitest";
import { refreshAfterClear, refreshAfterSave } from "./credentialsRefreshActions";

describe("refreshAfterSave", () => {
  it("reloads both status sources and clears restricted mode", () => {
    const reloadStoreStatus = vi.fn();
    const reloadServerStatus = vi.fn();
    const clearRestricted = vi.fn();

    refreshAfterSave({ reloadStoreStatus, reloadServerStatus }, clearRestricted);

    expect(reloadStoreStatus).toHaveBeenCalledOnce();
    expect(reloadServerStatus).toHaveBeenCalledOnce();
    expect(clearRestricted).toHaveBeenCalledOnce();
  });
});

describe("refreshAfterClear", () => {
  it("reloads both status sources without touching restricted mode", () => {
    const reloadStoreStatus = vi.fn();
    const reloadServerStatus = vi.fn();

    refreshAfterClear({ reloadStoreStatus, reloadServerStatus });

    expect(reloadStoreStatus).toHaveBeenCalledOnce();
    expect(reloadServerStatus).toHaveBeenCalledOnce();
  });
});
