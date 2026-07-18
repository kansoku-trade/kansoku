import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { HealthApi } from "../../../../packages/core/src/contract/index.js";
import { healthService } from "../../../../packages/core/src/modules/health/health.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class HealthIpc extends IpcService implements WrapEnvelope<HealthApi> {
  static readonly groupName = "health";

  @IpcMethod()
  get() {
    return toEnvelope("health.get", () => healthService.get());
  }
}
