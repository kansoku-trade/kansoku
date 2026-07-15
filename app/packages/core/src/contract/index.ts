import { annotationsRoutes, type AnnotationsApi } from "./annotations.js";
import { assistantRoutes, type AssistantApi } from "./assistant.js";
import { chartsRoutes, type ChartsApi } from "./charts.js";
import { chatRoutes, type ChatApi } from "./chat.js";
import { credentialsRoutes, type CredentialsApi } from "./credentials.js";
import { healthRoutes, type HealthApi } from "./health.js";
import { lobehubRoutes, type LobeHubApi } from "./lobehub.js";
import { overviewRoutes, type OverviewApi } from "./overview.js";
import { positionsRoutes, type PositionsApi } from "./positions.js";
import { researchRoutes, type ResearchApi } from "./research.js";
import { settingsRoutes, type SettingsApi } from "./settings.js";
import { symbolsRoutes, type SymbolsApi } from "./symbols.js";

export interface AppApi {
  assistant: AssistantApi;
  charts: ChartsApi;
  chat: ChatApi;
  symbols: SymbolsApi;
  annotations: AnnotationsApi;
  positions: PositionsApi;
  research: ResearchApi;
  overview: OverviewApi;
  settings: SettingsApi;
  credentials: CredentialsApi;
  health: HealthApi;
  lobehub: LobeHubApi;
}

export const allRoutes = {
  assistant: assistantRoutes,
  charts: chartsRoutes,
  chat: chatRoutes,
  symbols: symbolsRoutes,
  annotations: annotationsRoutes,
  positions: positionsRoutes,
  research: researchRoutes,
  overview: overviewRoutes,
  settings: settingsRoutes,
  credentials: credentialsRoutes,
  health: healthRoutes,
  lobehub: lobehubRoutes,
};

export * from "./annotations.js";
export * from "./assistant.js";
export * from "./charts.js";
export * from "./chat.js";
export * from "./credentials.js";
export * from "./defineRoutes.js";
export * from "./health.js";
export * from "./lobehub.js";
export * from "./overview.js";
export * from "./positions.js";
export * from "./research.js";
export * from "./settings.js";
export * from "./symbols.js";
