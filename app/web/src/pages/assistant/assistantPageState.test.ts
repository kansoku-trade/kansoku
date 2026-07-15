import { describe, expect, it } from "vitest";
import type { AssistantSessionMeta } from "../../../../packages/core/src/contract";
import { resolveActiveSessionId } from "./assistantPageState.js";

const session = (id: string): AssistantSessionMeta => ({
  id,
  title: id,
  createdAt: "2026-07-14T09:00:00Z",
  updatedAt: "2026-07-14T09:00:00Z",
});

describe("resolveActiveSessionId", () => {
  it("keeps the requested id when it still exists in the sessions list", () => {
    const sessions = [session("a"), session("b")];
    expect(resolveActiveSessionId("b", sessions)).toBe("b");
  });

  it("falls back to the first session when no id is requested", () => {
    const sessions = [session("a"), session("b")];
    expect(resolveActiveSessionId(null, sessions)).toBe("a");
  });

  it("falls back to the first remaining session when the requested id was deleted", () => {
    const sessions = [session("b"), session("c")];
    expect(resolveActiveSessionId("a", sessions)).toBe("b");
  });

  it("returns null when there are no sessions at all", () => {
    expect(resolveActiveSessionId("a", [])).toBeNull();
    expect(resolveActiveSessionId(null, [])).toBeNull();
  });
});
