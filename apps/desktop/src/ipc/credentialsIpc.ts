import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { CredentialsApi } from "../../../../packages/core/src/contract/index.js";
import { credentialsService } from "../../../../packages/core/src/modules/credentials/credentials.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class CredentialsIpc extends IpcService implements WrapEnvelope<CredentialsApi> {
  static readonly groupName = "credentials";

  @IpcMethod()
  status() {
    return toEnvelope("credentials.status", () => credentialsService.status());
  }

  @IpcMethod()
  opencliStatus() {
    return toEnvelope("credentials.opencliStatus", () => credentialsService.opencliStatus());
  }
}
