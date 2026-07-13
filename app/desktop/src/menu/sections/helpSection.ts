import type { MenuItemConstructorOptions } from "electron";
import type { MenuActionDeps } from "../types.js";

export function buildHelpSection(deps: MenuActionDeps): MenuItemConstructorOptions {
  return {
    role: "help",
    label: "帮助",
    submenu: [
      {
        label: "查看日志…",
        click: () => deps.openLogs(),
      },
      { type: "separator" },
      {
        label: "选择数据目录…",
        click: () => deps.selectDataRoot(),
      },
      {
        label: "从 repo 导入数据…",
        click: () => deps.importFromRepo(),
      },
    ],
  };
}
