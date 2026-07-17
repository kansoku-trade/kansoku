import { extendProModule } from "../../../packages/core/src/pro/registry.js";
import { AssistantIpc } from "../ipc/assistantIpc.js";
import { ChatIpc } from "../ipc/chatIpc.js";
import { LobeHubIpc } from "../ipc/lobehubIpc.js";
import { ResearchIpc } from "../ipc/researchIpc.js";

export function registerBuiltinProDesktop(): void {
  extendProModule({ ipcServiceClasses: [AssistantIpc, ChatIpc, ResearchIpc, LobeHubIpc] });
}
