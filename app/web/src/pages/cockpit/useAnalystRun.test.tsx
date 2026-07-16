// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelSpec } from "../../wsHub";

const subscribeChannel = vi.fn();
const reassess = vi.fn();
const reassessStatus = vi.fn();

vi.mock("../../wsHub", () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

vi.mock("../../client", () => ({
  client: {
    symbols: {
      reassess: (...args: unknown[]) => reassess(...args),
      reassessStatus: (...args: unknown[]) => reassessStatus(...args),
    },
  },
}));

const { resetAnalystRunsStoreForTests } = await import("../../analystRunsStore");
const { useAnalystRun, RECONCILE_WINDOW_MS } = await import("./useAnalystRun");

const runningStatus = (activity: string) => ({
  running: true as const,
  origin: "manual" as const,
  phase: "researching" as const,
  activity,
  startedAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
});

describe("useAnalystRun", () => {
  let subs: Array<{ onPayload: (payload: unknown) => void }>;

  beforeEach(() => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation((_spec: ChannelSpec, onPayload: (payload: unknown) => void) => {
      subs.push({ onPayload });
      return vi.fn();
    });
    reassess.mockReset();
    reassessStatus.mockReset();
  });

  afterEach(() => {
    cleanup();
    resetAnalystRunsStoreForTests();
    vi.useRealTimers();
  });

  it("reports not running when the store has no entry for the symbol", () => {
    const { result } = renderHook(() => useAnalystRun("NVDA"));

    expect(result.current.running).toBe(false);
    expect(result.current.status).toBeNull();
    expect(result.current.checking).toBe(false);
  });

  it("shows the optimistic placeholder on start until the store confirms the run", async () => {
    reassess.mockResolvedValue({ started: true });
    const { result } = renderHook(() => useAnalystRun("NVDA"));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.running).toBe(true);
    expect(result.current.status?.activity).toBe("正在等待服务端确认任务");

    act(() => {
      subs[0].onPayload({ type: "update", symbol: "NVDA", status: runningStatus("分析中") });
    });

    expect(result.current.status?.activity).toBe("分析中");
  });

  it("stops running once the store reports the symbol as no longer running", () => {
    const { result } = renderHook(() => useAnalystRun("NVDA"));

    act(() => {
      subs[0].onPayload({ type: "update", symbol: "NVDA", status: runningStatus("分析中") });
    });
    expect(result.current.running).toBe(true);

    act(() => {
      subs[0].onPayload({ type: "update", symbol: "NVDA", status: { running: false } });
    });

    expect(result.current.running).toBe(false);
    expect(result.current.status).toBeNull();
  });

  it("ignores runs for other symbols", () => {
    const { result } = renderHook(() => useAnalystRun("NVDA"));

    act(() => {
      subs[0].onPayload({ type: "update", symbol: "MU", status: runningStatus("分析中") });
    });

    expect(result.current.running).toBe(false);
  });

  it("clears the optimistic placeholder via the bounded re-check when no store update arrives", async () => {
    vi.useFakeTimers();
    reassess.mockResolvedValue({ started: true });
    reassessStatus.mockResolvedValue({ running: false });

    const { result } = renderHook(() => useAnalystRun("NVDA"));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.running).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONCILE_WINDOW_MS);
    });

    expect(reassessStatus).toHaveBeenCalledWith({ sym: "NVDA" });
    expect(result.current.running).toBe(false);
    expect(result.current.status).toBeNull();
  });

  it("re-arms the re-check when the server still reports running", async () => {
    vi.useFakeTimers();
    reassess.mockResolvedValue({ started: true });
    reassessStatus.mockResolvedValueOnce({ running: true }).mockResolvedValueOnce({ running: false });

    const { result } = renderHook(() => useAnalystRun("NVDA"));

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONCILE_WINDOW_MS);
    });
    expect(reassessStatus).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONCILE_WINDOW_MS);
    });
    expect(reassessStatus).toHaveBeenCalledTimes(2);
    expect(result.current.running).toBe(false);
  });

  it("clears the optimistic placeholder when the bounded re-check itself fails", async () => {
    vi.useFakeTimers();
    reassess.mockResolvedValue({ started: true });
    reassessStatus.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useAnalystRun("NVDA"));

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONCILE_WINDOW_MS);
    });

    expect(result.current.running).toBe(false);
  });
});
