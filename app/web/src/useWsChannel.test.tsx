// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWsChannel } from "./useWsChannel";
import type { ChannelSpec } from "./wsHub";
import { saveSnapshot } from "./wsSnapshot";

const subscribeChannel = vi.fn();

vi.mock("./wsHub", () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
  unsub: ReturnType<typeof vi.fn>;
}

function Probe({ spec, onData }: { spec: ChannelSpec | null; onData: (data: unknown) => void }) {
  useWsChannel(spec, onData);
  return null;
}

describe("useWsChannel", () => {
  let subs: Sub[];
  let testTime = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    testTime += 60_000;
    vi.setSystemTime(testTime);
    localStorage.clear();
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation(
      (spec: ChannelSpec, onPayload: (payload: unknown) => void, onConnected: (connected: boolean) => void) => {
        const unsub = vi.fn();
        subs.push({ spec, onPayload, onConnected, unsub });
        return unsub;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("replays the stored snapshot once before any live frame", () => {
    saveSnapshot({ kind: "board" }, { rev: "snapshot" });
    const onData = vi.fn();

    render(<Probe spec={{ kind: "board" }} onData={onData} />);

    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledWith({ rev: "snapshot" });
  });

  it("exposes snapshotAt for the replayed snapshot and clears it on a live frame", () => {
    saveSnapshot({ kind: "board" }, { rev: "snapshot" });
    const seen: (number | null)[] = [];

    function StateProbe() {
      const { snapshotAt } = useWsChannel<{ rev: string }>({ kind: "board" }, () => {});
      seen.push(snapshotAt);
      return null;
    }

    render(<StateProbe />);
    expect(seen[seen.length - 1]).not.toBeNull();

    act(() => subs[0].onPayload({ type: "data", data: { rev: "live" } }));
    expect(seen[seen.length - 1]).toBeNull();
  });

  it("replays the snapshot exactly once per effect run, then live frames flow through", () => {
    saveSnapshot({ kind: "board" }, { rev: "snapshot" });
    const onData = vi.fn();
    let snapshotAt: number | null = null;

    function StateProbe() {
      const state = useWsChannel<{ rev: string }>({ kind: "board" }, onData);
      snapshotAt = state.snapshotAt;
      return null;
    }

    render(<StateProbe />);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenLastCalledWith({ rev: "snapshot" });
    expect(snapshotAt).not.toBeNull();

    act(() => subs[0].onPayload({ type: "data", data: { rev: "live-1" } }));
    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenLastCalledWith({ rev: "live-1" });
    expect(snapshotAt).toBeNull();

    act(() => subs[0].onPayload({ type: "data", data: { rev: "live-2" } }));
    expect(onData).toHaveBeenCalledTimes(3);
    expect(onData).toHaveBeenLastCalledWith({ rev: "live-2" });
  });

  it("is inert when spec is null", () => {
    const onData = vi.fn();
    render(<Probe spec={null} onData={onData} />);

    expect(subscribeChannel).not.toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();
  });
});
