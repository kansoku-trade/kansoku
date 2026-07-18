import { describe, expect, it, vi } from "vitest";
import { createSaveQueue } from "./saveQueue";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSaveQueue", () => {
  it("serial: keeps at most one save in flight and stores a push during flight as pending", async () => {
    const d1 = defer<void>();
    const save = vi.fn(() => d1.promise);
    const queue = createSaveQueue<{ v: number }>({ save, initial: null });

    queue.push({ v: 1 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.flushing()).toBe(true);

    queue.push({ v: 2 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.pending()).toEqual({ v: 2 });

    d1.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("merge to latest: 3 pushes while flying collapse to exactly 2 save calls (first + last)", async () => {
    const d1 = defer<void>();
    const d2 = defer<void>();
    const deferreds = [d1, d2];
    let call = 0;
    const save = vi.fn(() => deferreds[call++].promise);
    const queue = createSaveQueue<{ v: number }>({ save, initial: null });

    queue.push({ v: 1 });
    queue.push({ v: 2 });
    queue.push({ v: 3 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ v: 1 });

    d1.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ v: 3 });

    d2.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.confirmed()).toEqual({ v: 3 });
    expect(queue.pending()).toBeNull();
  });

  it("confirm: on resolve the sent snapshot becomes confirmed and a pending snapshot is sent next automatically", async () => {
    const d1 = defer<void>();
    const d2 = defer<void>();
    const deferreds = [d1, d2];
    let call = 0;
    const save = vi.fn(() => deferreds[call++].promise);
    const queue = createSaveQueue<{ v: number }>({ save, initial: null });

    queue.push({ v: 1 });
    queue.push({ v: 2 });
    d1.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.confirmed()).toEqual({ v: 1 });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ v: 2 });

    d2.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.confirmed()).toEqual({ v: 2 });
    expect(queue.flushing()).toBe(false);
  });

  it("confirm adopts the save's returned value when non-void", async () => {
    const d1 = defer<{ v: number; server: true }>();
    const save = vi.fn(() => d1.promise);
    const queue = createSaveQueue<{ v: number; server?: boolean }>({ save, initial: null });

    queue.push({ v: 1 });
    d1.resolve({ v: 1, server: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.confirmed()).toEqual({ v: 1, server: true });
  });

  it("rollback: on reject, pending is dropped, confirmed stays put, onError fires, and the queue recovers on a later push", async () => {
    const d1 = defer<void>();
    const d2 = defer<void>();
    const deferreds = [d1, d2];
    let call = 0;
    const save = vi.fn(() => deferreds[call++].promise);
    const onError = vi.fn();
    const queue = createSaveQueue<{ v: number }>({ save, initial: { v: 0 }, onError });

    queue.push({ v: 1 });
    queue.push({ v: 2 });
    const err = new Error("boom");
    d1.reject(err);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.confirmed()).toEqual({ v: 0 });
    expect(queue.pending()).toBeNull();
    expect(queue.flushing()).toBe(false);
    expect(onError).toHaveBeenCalledWith(err, { v: 0 }, { v: 2 });
    expect(save).toHaveBeenCalledTimes(1);

    queue.push({ v: 3 });
    expect(save).toHaveBeenCalledTimes(2);
    d2.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.confirmed()).toEqual({ v: 3 });
  });

  it("reports the latest user intent as retry snapshot when an earlier save fails", async () => {
    const d1 = defer<void>();
    const save = vi.fn(() => d1.promise);
    const onError = vi.fn();
    const queue = createSaveQueue({ save, initial: { v: 0 }, onError });

    queue.push({ v: 1 });
    queue.push({ v: 2 });
    d1.reject(new Error("boom"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(expect.any(Error), { v: 0 }, { v: 2 });
  });

  it("mixed push→push→push with interleaved rejects lands on the final pushed state", async () => {
    const d1 = defer<void>();
    const d2 = defer<void>();
    const deferreds = [d1, d2];
    let call = 0;
    const save = vi.fn(() => deferreds[call++].promise);
    const onError = vi.fn();
    const queue = createSaveQueue<{ mode: string }>({ save, initial: { mode: "custom" }, onError });

    queue.push({ mode: "disabled" });
    queue.push({ mode: "custom" });
    queue.push({ mode: "inherit" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ mode: "disabled" });

    d1.reject(new Error("rejected"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.confirmed()).toEqual({ mode: "custom" });
    expect(save).toHaveBeenCalledTimes(1);

    queue.push({ mode: "inherit" });
    expect(save).toHaveBeenCalledTimes(2);
    d2.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.confirmed()).toEqual({ mode: "inherit" });
  });

  it("subscribe notifies on every state transition", async () => {
    const d1 = defer<void>();
    const save = vi.fn(() => d1.promise);
    const queue = createSaveQueue<{ v: number }>({ save, initial: null });
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    queue.push({ v: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    queue.push({ v: 2 });
    expect(listener).toHaveBeenCalledTimes(2);

    d1.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3);

    unsubscribe();
  });
});
