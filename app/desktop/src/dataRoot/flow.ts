import { join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { dataRoot, dataRootStatus } from "../boot/env.js";
import { markDataRootRestartPending } from "./restartState.js";
import { createDataRootFileStore } from "./store.js";
import { validateDataRootCandidate } from "./validate.js";

function messageBox(
  win: BrowserWindow | null,
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function openDialog(
  win: BrowserWindow | null,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

function getStore() {
  return createDataRootFileStore(join(app.getPath("userData"), "data-root.json"));
}

async function promptRestart(win: BrowserWindow | null, title: string): Promise<void> {
  const choice = await messageBox(win, {
    type: "info",
    buttons: ["稍后", "立即重启"],
    defaultId: 1,
    cancelId: 0,
    title,
    message: "数据目录设置已保存，需要重启应用后才会生效。",
  });
  if (choice.response === 1) {
    app.relaunch();
    app.quit();
  }
}

async function noteEnvOverrideIfNeeded(win: BrowserWindow | null, title: string): Promise<void> {
  if (dataRootStatus.mode !== "env") return;
  await messageBox(win, {
    type: "warning",
    title,
    message:
      "当前数据目录由环境变量 TRADE_PROJECT_ROOT 覆盖。现在的设置会写进偏好，去掉环境变量后下次启动才会生效。",
  });
}

async function runSelectDataRootFlowUnsafe(win: BrowserWindow | null): Promise<void> {
  const title = "选择数据目录";

  if (!app.isPackaged) {
    await messageBox(win, {
      type: "info",
      title,
      message: "开发模式已使用仓库目录，无需设置。",
    });
    return;
  }

  await noteEnvOverrideIfNeeded(win, title);

  const picked = await openDialog(win, {
    title: "选择数据目录（项目根）",
    properties: ["openDirectory"],
  });
  if (picked.canceled || picked.filePaths.length === 0) return;
  const candidate = picked.filePaths[0];

  const validation = validateDataRootCandidate(candidate, dataRoot);
  if (!validation.ok) {
    if (validation.reason === "needs-confirm-scaffold") {
      const choice = await messageBox(win, {
        type: "question",
        buttons: ["取消", "确认"],
        defaultId: 1,
        cancelId: 0,
        title,
        message:
          "这个目录不是空的，也还没有 journal/charts/data。确认后会在这里创建 journal/、stocks/ 等结构。是否继续？",
      });
      if (choice.response !== 1) return;
    } else {
      const messages = {
        self: "所选目录就是当前生效的数据目录，无需更改。",
        "not-dir": "所选路径不存在或不是文件夹。",
        "not-writable": "所选目录不可写，无法作为数据目录。",
      } as const;
      await messageBox(win, {
        type: "warning",
        title,
        message: messages[validation.reason],
      });
      return;
    }
  }

  await getStore().setPath(candidate);
  markDataRootRestartPending();
  await promptRestart(win, title);
}

async function runResetDataRootFlowUnsafe(win: BrowserWindow | null): Promise<void> {
  const title = "恢复默认数据目录";

  if (!app.isPackaged) {
    await messageBox(win, {
      type: "info",
      title,
      message: "开发模式已使用仓库目录，无需设置。",
    });
    return;
  }

  await noteEnvOverrideIfNeeded(win, title);

  await getStore().clear();
  markDataRootRestartPending();
  await promptRestart(win, title);
}

export async function runSelectDataRootFlow(win: BrowserWindow | null): Promise<void> {
  try {
    await runSelectDataRootFlowUnsafe(win);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[desktop] select-data-root failed", error);
    await messageBox(win, {
      type: "error",
      title: "选择数据目录",
      message: `设置失败：${message}`,
    });
  }
}

export async function runResetDataRootFlow(win: BrowserWindow | null): Promise<void> {
  try {
    await runResetDataRootFlowUnsafe(win);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[desktop] reset-data-root failed", error);
    await messageBox(win, {
      type: "error",
      title: "恢复默认数据目录",
      message: `恢复失败：${message}`,
    });
  }
}
