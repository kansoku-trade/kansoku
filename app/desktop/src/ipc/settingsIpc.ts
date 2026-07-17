import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { SettingsApi } from "../../../packages/core/src/contract/index.js";
import { settingsService } from "../../../packages/core/src/modules/settings/settings.service.js";
import { requirePro } from "../../../packages/core/src/pro/requirePro.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class SettingsIpc extends IpcService implements WrapEnvelope<SettingsApi> {
  static readonly groupName = "settings";

  @IpcMethod()
  getAi() {
    return toEnvelope("settings.getAi", () => {
      requirePro();
      return settingsService.getAi();
    });
  }

  @IpcMethod()
  putRole(input: Parameters<SettingsApi["putRole"]>[0]) {
    return toEnvelope("settings.putRole", () => {
      requirePro();
      return settingsService.putRole(input);
    });
  }

  @IpcMethod()
  deleteRole(input: Parameters<SettingsApi["deleteRole"]>[0]) {
    return toEnvelope("settings.deleteRole", () => {
      requirePro();
      return settingsService.deleteRole(input);
    });
  }

  @IpcMethod()
  putCredential(input: Parameters<SettingsApi["putCredential"]>[0]) {
    return toEnvelope("settings.putCredential", () => {
      requirePro();
      return settingsService.putCredential(input);
    });
  }

  @IpcMethod()
  deleteCredential(input: Parameters<SettingsApi["deleteCredential"]>[0]) {
    return toEnvelope("settings.deleteCredential", () => {
      requirePro();
      return settingsService.deleteCredential(input);
    });
  }

  @IpcMethod()
  getCatalog() {
    return toEnvelope("settings.getCatalog", () => {
      requirePro();
      return settingsService.getCatalog();
    });
  }

  @IpcMethod()
  testConnection(input: Parameters<SettingsApi["testConnection"]>[0]) {
    return toEnvelope("settings.testConnection", () => {
      requirePro();
      return settingsService.testConnection(input);
    });
  }

  @IpcMethod()
  getUsageToday() {
    return toEnvelope("settings.getUsageToday", () => {
      requirePro();
      return settingsService.getUsageToday();
    });
  }

  @IpcMethod()
  resetCredentials() {
    return toEnvelope("settings.resetCredentials", () => {
      requirePro();
      return settingsService.resetCredentials();
    });
  }

  @IpcMethod()
  getWatchedMarkets() {
    return toEnvelope("settings.getWatchedMarkets", () => settingsService.getWatchedMarkets());
  }

  @IpcMethod()
  putWatchedMarkets(input: Parameters<SettingsApi["putWatchedMarkets"]>[0]) {
    return toEnvelope("settings.putWatchedMarkets", () => settingsService.putWatchedMarkets(input));
  }
}
