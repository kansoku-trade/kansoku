import type { MenuItemConstructorOptions } from "electron";

export function buildEditSection(): MenuItemConstructorOptions {
  return {
    label: "编辑",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" },
      { type: "separator" },
      {
        label: "朗读",
        submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
      },
    ],
  };
}
