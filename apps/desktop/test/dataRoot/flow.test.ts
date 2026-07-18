import { describe, expect, it } from "vitest";
import {
  getDataRootRestartPending,
  markDataRootRestartPending,
} from "@desktop/dataRoot/restartState.js";

describe("data root restartPending flag", () => {
  it("starts false and flips true after mark", () => {
    expect(getDataRootRestartPending()).toBe(false);
    markDataRootRestartPending();
    expect(getDataRootRestartPending()).toBe(true);
  });
});
