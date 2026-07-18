import type { MenuItemConstructorOptions } from "electron";
import type { MenuActionDeps } from "../types.js";

export function buildGoSection(deps: MenuActionDeps): MenuItemConstructorOptions {
  return {
    label: "前往",
    submenu: [
      {
        label: "AI 对话",
        accelerator: "CmdOrCtrl+L",
        click: () => deps.openChat(),
      },
      {
        label: "研究库",
        accelerator: "CmdOrCtrl+Shift+L",
        click: () => deps.openResearch(),
      },
    ],
  };
}
