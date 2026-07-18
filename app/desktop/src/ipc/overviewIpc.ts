import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { OverviewApi } from "../../../packages/core/src/contract/index.js";
import { overviewService } from "../../../packages/core/src/modules/overview/overview.service.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class OverviewIpc extends IpcService implements WrapEnvelope<OverviewApi> {
  static readonly groupName = "overview";

  @IpcMethod()
  board() {
    return toEnvelope("overview.board", () => overviewService.board());
  }

  @IpcMethod()
  recap(input: Parameters<OverviewApi["recap"]>[0]) {
    return toEnvelope("overview.recap", () => overviewService.recap(input));
  }

  @IpcMethod()
  stats() {
    return toEnvelope("overview.stats", () => overviewService.stats());
  }

  @IpcMethod()
  usage(input: Parameters<OverviewApi["usage"]>[0]) {
    return toEnvelope("overview.usage", () => overviewService.usage(input));
  }

  @IpcMethod()
  recapDates() {
    return toEnvelope("overview.recapDates", () => overviewService.recapDates());
  }
}
