import { describe, expect, it } from "vitest";
import { createEmitter, emitData, emitStatus, replay } from "../src/realtime/emitter.js";

describe("emitter", () => {
  it("dedupes identical data envelopes", () => {
    const e = createEmitter();
    const events: string[] = [];
    e.listeners.add((env) => events.push(env));
    emitData(e, { a: 1 });
    emitData(e, { a: 1 });
    emitData(e, { a: 2 });
    expect(events).toHaveLength(2);
  });

  it("only emits status on a state transition", () => {
    const e = createEmitter();
    const events: string[] = [];
    e.listeners.add((env) => events.push(env));
    emitStatus(e, true, "boom");
    emitStatus(e, true, "boom again");
    emitStatus(e, false);
    expect(events).toHaveLength(2);
    expect(JSON.parse(events[0])).toEqual({ type: "status", degraded: true, error: "boom" });
    expect(JSON.parse(events[1])).toEqual({ type: "status", degraded: false });
  });

  it("replay pushes last data then degraded status to a fresh listener", () => {
    const e = createEmitter();
    emitData(e, { snapshot: true });
    emitStatus(e, true, "down");
    const received: string[] = [];
    replay(e, (env) => received.push(env));
    expect(JSON.parse(received[0])).toEqual({ type: "data", data: { snapshot: true } });
    expect(JSON.parse(received[1])).toEqual({ type: "status", degraded: true });
  });
});
