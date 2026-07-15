import { Module } from "@tsuki-hono/common";
import { AnnotationsModule } from "./annotations/annotations.module.js";
import { AssistantModule } from "./assistant/assistant.module.js";
import { ChartsModule } from "./charts/charts.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { CredentialsModule } from "./credentials/credentials.module.js";
import { HealthModule } from "./health/health.module.js";
import { LegacyModule } from "./legacy/legacy.module.js";
import { LobeHubModule } from "./lobehub/lobehub.module.js";
import { OverviewModule } from "./overview/overview.module.js";
import { PositionsModule } from "./positions/positions.module.js";
import { ResearchModule } from "./research/research.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { SymbolsModule } from "./symbols/symbols.module.js";

@Module({
  imports: [
    HealthModule,
    AssistantModule,
    ChartsModule,
    SymbolsModule,
    AnnotationsModule,
    PositionsModule,
    ResearchModule,
    OverviewModule,
    SettingsModule,
    ChatModule,
    LegacyModule,
    CredentialsModule,
    LobeHubModule,
  ],
})
export class AppModule {}
