import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { LicenseApi } from "@kansoku/core/contract/index";
import { licenseService } from "@kansoku/core/license/license.service";
import { maybePromptProRelaunchAfterKeyLanded } from "../../boot/proRelaunch.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class LicenseIpc extends IpcService implements WrapEnvelope<LicenseApi> {
  static readonly groupName = "license";

  @IpcMethod()
  status() {
    return toEnvelope("license.status", () => licenseService.status());
  }

  @IpcMethod()
  activate(input: Parameters<LicenseApi["activate"]>[0]) {
    return toEnvelope("license.activate", async () => {
      const result = await licenseService.activate(input.key);
      if (result.activated) void maybePromptProRelaunchAfterKeyLanded();
      return result;
    });
  }

  @IpcMethod()
  deactivate() {
    return toEnvelope("license.deactivate", () => licenseService.deactivate());
  }
}
