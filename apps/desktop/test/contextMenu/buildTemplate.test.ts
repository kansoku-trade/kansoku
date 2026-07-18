import { describe, expect, it, vi } from "vitest";
import { buildNativeContextMenuTemplate } from "@desktop/contextMenu/buildTemplate.js";

describe("buildNativeContextMenuTemplate", () => {
  it("maps items, dividers, accelerators, and checkbox/radio types", () => {
    const onSelect = vi.fn();
    const template = buildNativeContextMenuTemplate(
      [
        {
          type: "item",
          key: "open",
          label: "打开",
          enabled: true,
          accelerator: "CmdOrCtrl+O",
        },
        { type: "divider", key: "d1" },
        {
          type: "item",
          key: "copy",
          label: "复制",
          enabled: false,
          checked: true,
        },
        {
          type: "item",
          key: "radio-a",
          label: "视图 A",
          enabled: true,
          radioGroup: "view",
          checked: true,
        },
      ],
      onSelect,
    );

    expect(template[0]).toMatchObject({
      label: "打开",
      enabled: true,
      type: "normal",
      accelerator: "CmdOrCtrl+O",
    });
    expect(template[1]).toEqual({ type: "separator" });
    expect(template[2]).toMatchObject({
      label: "复制",
      enabled: false,
      type: "checkbox",
      checked: true,
    });
    expect(template[3]).toMatchObject({
      label: "视图 A",
      type: "radio",
      checked: true,
    });

    (template[0] as { click?: () => void }).click?.();
    expect(onSelect).toHaveBeenCalledWith("open");
  });

  it("maps nested submenus and routes leaf clicks by key", () => {
    const onSelect = vi.fn();
    const template = buildNativeContextMenuTemplate(
      [
        {
          type: "submenu",
          key: "more",
          label: "更多",
          enabled: true,
          items: [
            { type: "item", key: "export", label: "导出", enabled: true },
            { type: "divider", key: "d" },
            { type: "item", key: "share", label: "分享", enabled: true },
          ],
        },
      ],
      onSelect,
    );

    expect(template[0]).toMatchObject({ label: "更多", enabled: true });
    const submenu = (template[0] as { submenu?: Electron.MenuItemConstructorOptions[] }).submenu;
    expect(submenu).toHaveLength(3);
    expect(submenu?.[0]).toMatchObject({ label: "导出" });
    expect(submenu?.[1]).toEqual({ type: "separator" });
    (submenu?.[0] as { click?: () => void }).click?.();
    expect(onSelect).toHaveBeenCalledWith("export");
  });
});
