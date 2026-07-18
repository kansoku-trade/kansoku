import { describe, expect, it } from "vitest";
import { allRoutes } from "@kansoku/core/contract/index";
import { IPC_GROUPS } from "@desktop/ipc/groups.js";

describe("IPC_GROUPS", () => {
  it("matches the contract's AppApi group keys exactly", () => {
    expect([...IPC_GROUPS].sort()).toEqual(Object.keys(allRoutes).sort());
  });
});
