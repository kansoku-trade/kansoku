import { describe, expect, it } from "vitest";
import { parseWsMessage } from "../src/routes/ws.js";

describe("parseWsMessage", () => {
  it("parses a quotes sub with extra symbols", () => {
    expect(parseWsMessage({ op: "sub", key: "k1", kind: "quotes", extra: ["MU.US", 3] })).toEqual({
      op: "sub",
      key: "k1",
      kind: "quotes",
      extra: ["MU.US"],
    });
  });

  it("parses chart and comments subs", () => {
    expect(parseWsMessage({ op: "sub", key: "k2", kind: "chart", id: "2026-07-06-mu", count: 150 })).toEqual({
      op: "sub",
      key: "k2",
      kind: "chart",
      id: "2026-07-06-mu",
      count: 150,
    });
    expect(parseWsMessage({ op: "sub", key: "k3", kind: "comments", symbol: "mu" })).toEqual({
      op: "sub",
      key: "k3",
      kind: "comments",
      symbol: "mu",
    });
  });

  it("parses an analyses sub", () => {
    expect(parseWsMessage({ op: "sub", key: "k4", kind: "analyses", symbol: "mu" })).toEqual({
      op: "sub",
      key: "k4",
      kind: "analyses",
      symbol: "mu",
    });
    expect(parseWsMessage({ op: "sub", key: "k", kind: "analyses" })).toBeNull();
  });

  it("parses unsub", () => {
    expect(parseWsMessage({ op: "unsub", key: "k1" })).toEqual({ op: "unsub", key: "k1" });
  });

  it("rejects garbage", () => {
    expect(parseWsMessage(null)).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "", kind: "quotes" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "chart" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "comments" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "k", kind: "nope" })).toBeNull();
    expect(parseWsMessage({ op: "sub", key: "x".repeat(201), kind: "quotes" })).toBeNull();
  });
});
