import { describe, expect, it } from "vitest";
import type { AssistantSessionMeta } from "../../../../packages/core/src/contract";
import { mergeOptimisticSessions } from "./useAssistantSessions";

const session = (id: string): AssistantSessionMeta => ({
  id,
  title: id,
  createdAt: "2026-07-14T09:00:00Z",
  updatedAt: "2026-07-14T09:00:00Z",
});

describe("mergeOptimisticSessions", () => {
  it("prepends a pending session not yet present in the server list", () => {
    const server = [session("a"), session("b")];
    const pending = [session("new")];
    expect(mergeOptimisticSessions(server, pending)).toEqual([session("new"), session("a"), session("b")]);
  });

  it("drops a pending session once the server list already contains it", () => {
    const server = [session("new"), session("a")];
    const pending = [session("new")];
    expect(mergeOptimisticSessions(server, pending)).toEqual(server);
  });

  it("returns the server list unchanged when there is no pending session", () => {
    const server = [session("a"), session("b")];
    expect(mergeOptimisticSessions(server, [])).toEqual(server);
  });
});
