import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { PositionsApi } from "../../../../packages/core/src/contract/index.js";
import { createPositionsService } from "../../../../packages/core/src/modules/positions/positions.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

const positionsService = createPositionsService();

export class PositionsIpc extends IpcService implements WrapEnvelope<PositionsApi> {
  static readonly groupName = "positions";

  @IpcMethod()
  list() {
    return toEnvelope("positions.list", () => positionsService.list());
  }
}
