import type { MenuItemConstructorOptions } from "electron";
import type { MenuActionDeps } from "../types.js";

export function buildWindowSection(deps: MenuActionDeps): MenuItemConstructorOptions {
  return {
    label: "窗口",
    submenu: [
      {
        label: "新建窗口",
        accelerator: "CmdOrCtrl+N",
        click: () => deps.newWindow(),
      },
      {
        label: "新建标签页",
        accelerator: "CmdOrCtrl+T",
        click: () => deps.newTab(),
      },
      {
        label: "关闭标签页",
        accelerator: "CmdOrCtrl+W",
        click: () => deps.closeTab(),
      },
      { type: "separator" },
      {
        label: "下一个标签页",
        accelerator: "CmdOrCtrl+Shift+]",
        click: () => deps.nextTab(),
      },
      {
        label: "上一个标签页",
        accelerator: "CmdOrCtrl+Shift+[",
        click: () => deps.prevTab(),
      },
      { type: "separator" },
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { role: "front" },
    ],
  };
}
