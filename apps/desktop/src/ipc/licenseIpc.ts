import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { LicenseApi } from "../../../../packages/core/src/contract/index.js";
import { licenseService } from "../../../../packages/core/src/modules/license/license.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class LicenseIpc extends IpcService implements WrapEnvelope<LicenseApi> {
  static readonly groupName = "license";

  @IpcMethod()
  status() {
    return toEnvelope("license.status", () => licenseService.status());
  }

  @IpcMethod()
  activate(input: Parameters<LicenseApi["activate"]>[0]) {
    return toEnvelope("license.activate", () => licenseService.activate(input.key));
  }

  @IpcMethod()
  deactivate() {
    return toEnvelope("license.deactivate", () => licenseService.deactivate());
  }
}
