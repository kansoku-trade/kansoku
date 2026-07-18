import { describe, expect, it } from "vitest";
import { shouldShowDefaultMenu } from "@desktop/contextMenu/defaultMenu.js";

describe("shouldShowDefaultMenu", () => {
  it("shows for editable fields and text selection", () => {
    expect(
      shouldShowDefaultMenu(null, {
        isEditable: true,
        selectionText: "",
        mediaType: "none",
        linkURL: "",
      }),
    ).toBe(true);
    expect(
      shouldShowDefaultMenu(null, {
        isEditable: false,
        selectionText: "NVDA",
        mediaType: "none",
        linkURL: "",
      }),
    ).toBe(true);
  });

  it("shows for media and links", () => {
    expect(
      shouldShowDefaultMenu(null, {
        isEditable: false,
        selectionText: "",
        mediaType: "image",
        linkURL: "",
      }),
    ).toBe(true);
    expect(
      shouldShowDefaultMenu(null, {
        isEditable: false,
        selectionText: "",
        mediaType: "none",
        linkURL: "https://example.com",
      }),
    ).toBe(true);
  });

  it("hides on plain chrome so app command menus can own the click", () => {
    expect(
      shouldShowDefaultMenu(null, {
        isEditable: false,
        selectionText: "",
        mediaType: "none",
        linkURL: "",
      }),
    ).toBe(false);
  });
});
