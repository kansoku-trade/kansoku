import { builtinProModule } from "../../../packages/core/src/pro/builtin.js";
import { registerProModule } from "../../../packages/core/src/pro/registry.js";
import { AssistantModule } from "../modules/assistant/assistant.module.js";
import { ChatModule } from "../modules/chat/chat.module.js";
import { LobeHubModule } from "../modules/lobehub/lobehub.module.js";
import { ResearchModule } from "../modules/research/research.module.js";

export function registerBuiltinProServer(): void {
  registerProModule({
    ...builtinProModule,
    tsukiModules: [AssistantModule, ResearchModule, ChatModule, LobeHubModule],
  });
}
