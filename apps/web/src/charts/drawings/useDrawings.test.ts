import { describe, expect, it } from "vitest";
import type { Annotation } from "../../../../../packages/shared/types";
import { decodeAnnotationsFrame, mergePendingRemote } from "./useDrawings";

const sample: Annotation[] = [
  { id: "a1", kind: "hline", points: [{ time: 1, price: 2 }], createdAt: 1 },
];

describe("decodeAnnotationsFrame", () => {
  it("accepts an init frame regardless of clientId", () => {
    expect(decodeAnnotationsFrame({ type: "init", annotations: sample }, "me")).toBe(sample);
  });

  it("accepts an update frame from another client", () => {
    expect(decodeAnnotationsFrame({ type: "update", annotations: sample, clientId: "other" }, "me")).toBe(sample);
  });

  it("accepts an update frame with no clientId", () => {
    expect(decodeAnnotationsFrame({ type: "update", annotations: sample }, "me")).toBe(sample);
  });

  it("ignores an update frame echoing its own clientId", () => {
    expect(decodeAnnotationsFrame({ type: "update", annotations: sample, clientId: "me" }, "me")).toBeNull();
  });

  it("ignores unknown frame types", () => {
    expect(decodeAnnotationsFrame({ type: "status", degraded: true }, "me")).toBeNull();
  });

  it("ignores malformed payloads", () => {
    expect(decodeAnnotationsFrame(null, "me")).toBeNull();
    expect(decodeAnnotationsFrame({ type: "update", annotations: "nope" }, "me")).toBeNull();
    expect(decodeAnnotationsFrame(undefined, "me")).toBeNull();
  });
});

describe("mergePendingRemote", () => {
  const remoteOnly: Annotation = { id: "r1", kind: "hline", points: [{ time: 1, price: 2 }], createdAt: 1 };
  const localNew: Annotation = { id: "l1", kind: "hline", points: [{ time: 3, price: 4 }], createdAt: 2 };
  const sharedRemote: Annotation = { id: "s1", kind: "hline", points: [{ time: 5, price: 6 }], createdAt: 3 };
  const sharedLocalStale: Annotation = { id: "s1", kind: "hline", points: [{ time: 5, price: 99 }], createdAt: 3 };

  it("surfaces remote-only annotations when local has none", () => {
    expect(mergePendingRemote([remoteOnly], [])).toEqual([remoteOnly]);
  });

  it("keeps a locally added annotation the remote frame predates", () => {
    const merged = mergePendingRemote([remoteOnly], [remoteOnly, localNew]);
    expect(merged).toContainEqual(remoteOnly);
    expect(merged).toContainEqual(localNew);
    expect(merged).toHaveLength(2);
  });

  it("does not duplicate ids known to both sides, preferring the remote version", () => {
    const merged = mergePendingRemote([sharedRemote], [sharedLocalStale]);
    expect(merged).toEqual([sharedRemote]);
  });
});
