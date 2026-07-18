import { describe, expect, it } from "vitest";
import { allRoutes } from "../../../../packages/core/src/contract/index.js";
import { IPC_GROUPS } from "../../src/ipc/groups.js";

describe("IPC_GROUPS", () => {
  it("matches the contract's AppApi group keys exactly", () => {
    expect([...IPC_GROUPS].sort()).toEqual(Object.keys(allRoutes).sort());
  });
});
