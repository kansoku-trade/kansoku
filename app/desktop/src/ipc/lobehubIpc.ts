import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { LobeHubApi } from "../../../packages/core/src/contract/index.js";
import { lobehubService } from "../../../packages/core/src/modules/lobehub/lobehub.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class LobeHubIpc extends IpcService implements WrapEnvelope<LobeHubApi> {
  static readonly groupName = "lobehub";

  @IpcMethod()
  startDeviceLogin() {
    return toEnvelope("lobehub.startDeviceLogin", () => lobehubService.startDeviceLogin());
  }

  @IpcMethod()
  pollDeviceLogin() {
    return toEnvelope("lobehub.pollDeviceLogin", () => lobehubService.pollDeviceLogin());
  }

  @IpcMethod()
  getAccount() {
    return toEnvelope("lobehub.getAccount", () => lobehubService.getAccount());
  }

  @IpcMethod()
  getCredits() {
    return toEnvelope("lobehub.getCredits", () => lobehubService.getCredits());
  }

  @IpcMethod()
  deleteSession() {
    return toEnvelope("lobehub.deleteSession", () => lobehubService.deleteSession());
  }
}
