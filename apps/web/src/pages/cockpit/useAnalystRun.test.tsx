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
const { useAnalystRun } = await import("./useAnalystRun");

const runningStatus = (activity: string) => ({
  running: true as const,
  origin: "manual" as const,
  phase: "researching" as const,
  activity,
  startedAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
});

async function advanceReconcileTimer(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersToNextTimerAsync();
  });
}

describe("useAnalystRun", () => {
  let subs: Array<{
    onConnected: (connected: boolean) => void;
    onPayload: (payload: unknown) => void;
  }>;

  beforeEach(() => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation(
      (
        _spec: ChannelSpec,
        onPayload: (payload: unknown) => void,
        onConnected: (connected: boolean) => void,
      ) => {
        subs.push({ onConnected, onPayload });
        return vi.fn();
      },
    );
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

  it("does not restore an optimistic placeholder after WS events arrive before the POST response", async () => {
    vi.useFakeTimers();
    let resolveReassess: ((value: { started: boolean }) => void) | undefined;
    reassess.mockReturnValue(
      new Promise((resolve) => {
        resolveReassess = resolve;
      }),
    );
    const { result } = renderHook(() => useAnalystRun("NVDA"));
    let startPromise: Promise<void> | undefined;

    act(() => {
      startPromise = result.current.start();
    });
    act(() => {
      subs[0].onPayload({ type: "update", symbol: "NVDA", status: runningStatus("分析中") });
    });
    expect(result.current.running).toBe(true);

    act(() => {
      subs[0].onPayload({ type: "update", symbol: "NVDA", status: { running: false } });
    });
    expect(result.current.running).toBe(false);

    await act(async () => {
      resolveReassess?.({ started: true });
      await startPromise;
    });

    expect(result.current.running).toBe(false);
    expect(result.current.status).toBeNull();
    expect(reassessStatus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restores the optimistic placeholder when a running WS event is followed by a disconnect", async () => {
    vi.useFakeTimers();
    let resolveReassess: ((value: { started: boolean }) => void) | undefined;
    reassess.mockReturnValue(
      new Promise((resolve) => {
        resolveReassess = resolve;
      }),
    );
    const { result } = renderHook(() => useAnalystRun("NVDA"));
    let startPromise: Promise<void> | undefined;

    act(() => {
      startPromise = result.current.start();
    });
    act(() => {
      subs[0].onPayload({ type: "update", symbol: "NVDA", status: runningStatus("分析中") });
    });
    expect(result.current.running).toBe(true);

    act(() => {
      subs[0].onConnected(false);
    });
    expect(result.current.running).toBe(false);

    await act(async () => {
      resolveReassess?.({ started: true });
      await startPromise;
    });

    expect(result.current.running).toBe(true);
    expect(result.current.status?.activity).toBe("正在等待服务端确认任务");
    expect(reassessStatus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
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

    await advanceReconcileTimer();

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

    await advanceReconcileTimer();
    expect(reassessStatus).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(true);

    await advanceReconcileTimer();
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

    await advanceReconcileTimer();

    expect(result.current.running).toBe(false);
  });

  it("ignores an in-flight re-check that resolves after unmount", async () => {
    vi.useFakeTimers();
    reassess.mockResolvedValue({ started: true });
    let resolveStatus: ((value: { running: boolean }) => void) | undefined;
    reassessStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useAnalystRun("NVDA"));

    await act(async () => {
      await result.current.start();
    });

    await advanceReconcileTimer();
    expect(reassessStatus).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      resolveStatus?.({ running: true });
      await Promise.resolve();
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the new symbol's optimistic placeholder when the old symbol's re-check resolves late", async () => {
    vi.useFakeTimers();
    reassess.mockResolvedValue({ started: true });
    let resolveStatus: ((value: { running: boolean }) => void) | undefined;
    reassessStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );

    const { result, rerender } = renderHook(({ symbol }) => useAnalystRun(symbol), {
      initialProps: { symbol: "NVDA" },
    });

    await act(async () => {
      await result.current.start();
    });

    await advanceReconcileTimer();
    expect(reassessStatus).toHaveBeenCalledWith({ sym: "NVDA" });

    rerender({ symbol: "MU" });

    reassessStatus.mockResolvedValue({ running: true });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.running).toBe(true);
    const muActivity = result.current.status?.activity;

    await act(async () => {
      resolveStatus?.({ running: false });
      await Promise.resolve();
    });

    expect(result.current.running).toBe(true);
    expect(result.current.status?.activity).toBe(muActivity);
  });
});
