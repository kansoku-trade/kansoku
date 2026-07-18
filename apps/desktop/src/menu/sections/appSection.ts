import type { MenuItemConstructorOptions } from "electron";
import type { MenuActionDeps } from "../types.js";

export function buildAppSectionWithName(
  appName: string,
  deps: MenuActionDeps,
): MenuItemConstructorOptions {
  return {
    label: appName,
    submenu: [
      {
        label: `关于 ${appName}`,
        click: () => deps.openAbout(),
      },
      { type: "separator" },
      {
        label: "检查更新…",
        click: () => deps.checkForUpdates(),
      },
      { type: "separator" },
      {
        label: "设置…",
        accelerator: "CmdOrCtrl+,",
        click: () => deps.openSettings(),
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };
}
