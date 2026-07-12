import { ipcMain } from "electron";
import type { ExternalApiController } from "./controller.js";

// The preload exposes desktop.externalApi only to privileged origins (app://
// pages, or the dev renderer under ELECTRON_DEV — same gate as __DESKTOP_RT__),
// so these handlers don't re-check the sender origin.
export function registerExternalApiIpc(controller: ExternalApiController): void {
  ipcMain.handle("desktop:external-api:get-state", () => controller.getState());
  ipcMain.handle("desktop:external-api:enable", () => controller.enable());
  ipcMain.handle("desktop:external-api:disable", () => controller.disable());
  ipcMain.handle("desktop:external-api:reset-token", () => controller.resetToken());
}
