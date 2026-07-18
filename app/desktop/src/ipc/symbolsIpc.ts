import { IpcMethod, IpcService } from "electron-ipc-decorator";
import type { SymbolsApi } from "../../../packages/core/src/contract/index.js";
import { symbolsService } from "../../../packages/core/src/modules/symbols/symbols.service.js";
import { requirePro } from "../../../packages/core/src/pro/requirePro.js";
import { toEnvelope, type WrapEnvelope } from "./envelope.js";

export class SymbolsIpc extends IpcService implements WrapEnvelope<SymbolsApi> {
  static readonly groupName = "symbols";

  @IpcMethod()
  flow(input: Parameters<SymbolsApi["flow"]>[0]) {
    return toEnvelope("symbols.flow", () => symbolsService.flow(input));
  }

  @IpcMethod()
  benchmark(input: Parameters<SymbolsApi["benchmark"]>[0]) {
    return toEnvelope("symbols.benchmark", () => symbolsService.benchmark(input));
  }

  @IpcMethod()
  position(input: Parameters<SymbolsApi["position"]>[0]) {
    return toEnvelope("symbols.position", () => symbolsService.position(input));
  }

  @IpcMethod()
  analyses(input: Parameters<SymbolsApi["analyses"]>[0]) {
    return toEnvelope("symbols.analyses", () => symbolsService.analyses(input));
  }

  @IpcMethod()
  relvol(input: Parameters<SymbolsApi["relvol"]>[0]) {
    return toEnvelope("symbols.relvol", () => symbolsService.relvol(input));
  }

  @IpcMethod()
  comments(input: Parameters<SymbolsApi["comments"]>[0]) {
    return toEnvelope("symbols.comments", () => symbolsService.comments(input));
  }

  @IpcMethod()
  commentDates(input: Parameters<SymbolsApi["commentDates"]>[0]) {
    return toEnvelope("symbols.commentDates", () => symbolsService.commentDates(input));
  }

  @IpcMethod()
  followStatus(input: Parameters<SymbolsApi["followStatus"]>[0]) {
    return toEnvelope("symbols.followStatus", () => symbolsService.followStatus(input));
  }

  @IpcMethod()
  startFollow(input: Parameters<SymbolsApi["startFollow"]>[0]) {
    return toEnvelope("symbols.startFollow", () => symbolsService.startFollow(input));
  }

  @IpcMethod()
  stopFollow(input: Parameters<SymbolsApi["stopFollow"]>[0]) {
    return toEnvelope("symbols.stopFollow", () => symbolsService.stopFollow(input));
  }

  @IpcMethod()
  journal(input: Parameters<SymbolsApi["journal"]>[0]) {
    return toEnvelope("symbols.journal", () => symbolsService.journal(input));
  }

  @IpcMethod()
  journalEntry(input: Parameters<SymbolsApi["journalEntry"]>[0]) {
    return toEnvelope("symbols.journalEntry", () => symbolsService.journalEntry(input));
  }

  @IpcMethod()
  reassess(input: Parameters<SymbolsApi["reassess"]>[0]) {
    return toEnvelope("symbols.reassess", () => symbolsService.reassess(input));
  }

  @IpcMethod()
  reassessStatus(input: Parameters<SymbolsApi["reassessStatus"]>[0]) {
    return toEnvelope("symbols.reassessStatus", () => symbolsService.reassessStatus(input));
  }

  @IpcMethod()
  note(input: Parameters<SymbolsApi["note"]>[0]) {
    return toEnvelope("symbols.note", () => symbolsService.note(input));
  }

  @IpcMethod()
  deepDive(input: Parameters<SymbolsApi["deepDive"]>[0]) {
    return toEnvelope("symbols.deepDive", () => {
      requirePro();
      return symbolsService.deepDive(input);
    });
  }

  @IpcMethod()
  deepDiveStatus(input: Parameters<SymbolsApi["deepDiveStatus"]>[0]) {
    return toEnvelope("symbols.deepDiveStatus", () => {
      requirePro();
      return symbolsService.deepDiveStatus(input);
    });
  }

  @IpcMethod()
  latest(input: Parameters<SymbolsApi["latest"]>[0]) {
    return toEnvelope("symbols.latest", () => symbolsService.latest(input));
  }
}
