import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPoller } from "../src/realtime/poller.js";

describe("poller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits only when data changes", async () => {
    let value = "a";
    const poller = createPoller({ intervalMs: 1000, task: async () => value });
    const events: string[] = [];
    const unsub = poller.subscribe((e) => events.push(e));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.filter((e) => JSON.parse(e).type === "data")).toHaveLength(1);

    value = "b";
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.filter((e) => JSON.parse(e).type === "data")).toHaveLength(2);
    unsub();
  });

  it("stops polling when last subscriber leaves and calls onStop", async () => {
    let calls = 0;
    let stopped = false;
    const poller = createPoller({
      intervalMs: 1000,
      task: async () => ++calls,
      onStop: () => {
        stopped = true;
      },
    });
    const unsub = poller.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    unsub();
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(1);
  });

  it("backs off after repeated failures and recovers", async () => {
    let fail = true;
    let calls = 0;
    const poller = createPoller({
      intervalMs: 1000,
      failThreshold: 3,
      backoffMs: 60_000,
      task: async () => {
        calls++;
        if (fail) throw new Error("boom");
        return "ok";
      },
    });
    const events: { type: string; degraded?: boolean }[] = [];
    const unsub = poller.subscribe((e) => events.push(JSON.parse(e)));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(3);
    expect(events.filter((e) => e.type === "status" && e.degraded)).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(3);
    fail = false;
    await vi.advanceTimersByTimeAsync(59_000);
    expect(calls).toBe(4);
    expect(events.some((e) => e.type === "status" && e.degraded === false)).toBe(true);
    expect(events.some((e) => e.type === "data")).toBe(true);
    unsub();
  });

  it("replays last data to new subscribers immediately", async () => {
    const poller = createPoller({ intervalMs: 1000, task: async () => "snapshot" });
    const first = poller.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const events: string[] = [];
    const second = poller.subscribe((e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]).data).toBe("snapshot");
    first();
    second();
  });
});
