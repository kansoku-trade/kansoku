import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@kansoku/shared/types";
import type { Connection } from "../src/realtime/connection.js";

let annotationsDir: string;

vi.mock("../src/env.js", async () => {
  const actual = await vi.importActual<typeof import("../src/env.js")>("../src/env.js");
  return {
    ...actual,
    get ANNOTATIONS_DIR() {
      return annotationsDir;
    },
  };
});

const { loadAnnotations, saveAnnotations, onAnnotationsChanged } = await import("../src/services/annotations.js");
const { handleConnection } = await import("../src/realtime/channelProtocol.js");

class FakeConnection implements Connection {
  sent: string[] = [];
  private messageListeners: ((text: string) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  send(text: string): void {
    this.sent.push(text);
  }
  onMessage(cb: (text: string) => void): void {
    this.messageListeners.push(cb);
  }
  onClose(cb: () => void): void {
    this.closeListeners.push(cb);
  }
  emitMessage(text: string): void {
    for (const cb of this.messageListeners) cb(text);
  }
  emitClose(): void {
    for (const cb of this.closeListeners) cb();
  }
}

function makeSocket(): FakeConnection {
  const conn = new FakeConnection();
  handleConnection(conn);
  return conn;
}

async function waitFor(check: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    if (!check()) throw new Error("condition not met");
  });
}

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "ann-1",
    kind: "trendline",
    points: [
      { time: 1700000000, price: 100 },
      { time: 1700000100, price: 110 },
    ],
    createdAt: 1700000000000,
    ...overrides,
  };
}

beforeEach(async () => {
  annotationsDir = await mkdtemp(join(tmpdir(), "annotations-rt-test-"));
});

afterEach(async () => {
  await rm(annotationsDir, { recursive: true, force: true });
});

describe("annotations event bus (services/annotations.ts)", () => {
  it("broadcasts to subscribers of the saved symbol only", async () => {
    const nvdaEvents: unknown[] = [];
    const muEvents: unknown[] = [];
    const unsubNvda = onAnnotationsChanged("NVDA.US", (e) => nvdaEvents.push(e));
    const unsubMu = onAnnotationsChanged("MU.US", (e) => muEvents.push(e));

    const annotations = [makeAnnotation()];
    await saveAnnotations("nvda.us", annotations);

    expect(nvdaEvents).toEqual([{ symbol: "NVDA.US", annotations }]);
    expect(muEvents).toEqual([]);
    unsubNvda();
    unsubMu();
  });

  it("carries clientId when provided, omits it when not", async () => {
    const events: { symbol: string; annotations: Annotation[]; clientId?: string }[] = [];
    const unsub = onAnnotationsChanged("NVDA.US", (e) => events.push(e));

    await saveAnnotations("NVDA.US", [makeAnnotation()], "client-a");
    await saveAnnotations("NVDA.US", [makeAnnotation({ id: "ann-2" })]);

    expect(events[0].clientId).toBe("client-a");
    expect(events[1]).not.toHaveProperty("clientId");
    unsub();
  });
});

describe("annotations realtime channel (channelProtocol.ts)", () => {
  it("sends an init frame with the current annotations on attach", async () => {
    await saveAnnotations("NVDA.US", [makeAnnotation()]);

    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "a1", kind: "annotations", symbol: "nvda.us" }));
    await waitFor(() => socket.sent.length > 0);

    const envelope = JSON.parse(socket.sent[0]);
    expect(envelope).toEqual({
      key: "a1",
      payload: { type: "init", annotations: [makeAnnotation()] },
    });
  });

  it("sends an empty init frame for a symbol with no saved annotations", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "a1", kind: "annotations", symbol: "QQQ.US" }));
    await waitFor(() => socket.sent.length > 0);

    expect(JSON.parse(socket.sent[0]).payload).toEqual({ type: "init", annotations: [] });
  });

  it("pushes an update frame to subscribers when a replace succeeds, carrying clientId", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "a1", kind: "annotations", symbol: "NVDA.US" }));
    await waitFor(() => socket.sent.length > 0);

    await saveAnnotations("NVDA.US", [makeAnnotation()], "client-a");
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"update"')));

    const update = JSON.parse(socket.sent.find((raw) => raw.includes('"type":"update"'))!);
    expect(update).toEqual({
      key: "a1",
      payload: { type: "update", annotations: [makeAnnotation()], clientId: "client-a" },
    });
  });

  it("omits clientId on the update frame when the replace carried none", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "a1", kind: "annotations", symbol: "NVDA.US" }));
    await waitFor(() => socket.sent.length > 0);

    await saveAnnotations("NVDA.US", [makeAnnotation()]);
    await waitFor(() => socket.sent.some((raw) => raw.includes('"type":"update"')));

    const update = JSON.parse(socket.sent.find((raw) => raw.includes('"type":"update"'))!);
    expect(update.payload).toEqual({ type: "update", annotations: [makeAnnotation()] });
  });

  it("does not push a replace on a different symbol to this subscriber", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "a1", kind: "annotations", symbol: "NVDA.US" }));
    await waitFor(() => socket.sent.length > 0);

    await saveAnnotations("MU.US", [makeAnnotation()]);
    await new Promise((r) => setTimeout(r, 20));

    expect(socket.sent.some((raw) => raw.includes('"type":"update"'))).toBe(false);
  });

  it("stops delivering updates after unsubscribe", async () => {
    const socket = makeSocket();
    socket.emitMessage(JSON.stringify({ op: "sub", key: "a1", kind: "annotations", symbol: "NVDA.US" }));
    await waitFor(() => socket.sent.length > 0);

    socket.emitMessage(JSON.stringify({ op: "unsub", key: "a1" }));
    await saveAnnotations("NVDA.US", [makeAnnotation()]);
    await new Promise((r) => setTimeout(r, 20));

    expect(socket.sent.some((raw) => raw.includes('"type":"update"'))).toBe(false);
  });
});
