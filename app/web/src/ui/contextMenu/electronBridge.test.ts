import { describe, expect, it } from "vitest";
import { getDesktopContextMenuBridge } from "./electronBridge.js";

describe("getDesktopContextMenuBridge", () => {
  it("returns null when missing", () => {
    expect(getDesktopContextMenuBridge({})).toBeNull();
  });

  it("returns bridge when present", () => {
    const contextMenu = {
      popup: async () => ({ selectedKey: null }),
    };
    expect(getDesktopContextMenuBridge({ desktop: { contextMenu } })).toBe(contextMenu);
  });
});
