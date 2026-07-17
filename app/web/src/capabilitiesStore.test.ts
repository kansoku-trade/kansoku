// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("./client", () => ({
  client: { capabilities: { get: (...args: unknown[]) => get(...args) } },
}));

const store = await import("./capabilitiesStore");

describe("capabilitiesStore", () => {
  beforeEach(() => {
    get.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    store.resetCapabilitiesStoreForTests();
    vi.useRealTimers();
  });

  it("loads capabilities on mount", async () => {
    get.mockResolvedValue({ pro: true, licensed: true });
    const { result } = renderHook(() => store.useCapabilities());

    await vi.waitFor(() => expect(result.current.pro).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("retries after a fetch failure instead of leaving pro stuck at null", async () => {
    get.mockRejectedValueOnce(new Error("network down"));
    get.mockResolvedValueOnce({ pro: true, licensed: true });

    const { result } = renderHook(() => store.useCapabilities());
    expect(result.current.pro).toBeNull();

    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(result.current.pro).toBe(true));
  });
});
