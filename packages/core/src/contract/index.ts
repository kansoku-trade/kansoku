import { agentKitRoutes, type AgentKitApi } from './agentKit.js';
import { annotationsRoutes, type AnnotationsApi } from './annotations.js';
import { assistantRoutes, type AssistantApi } from './assistant.js';
import { canvasRoutes, type CanvasApi } from './canvas.js';
import { capabilitiesRoutes, type CapabilitiesApi } from './capabilities.js';
import { chartsRoutes, type ChartsApi } from './charts.js';
import { chatRoutes, type ChatApi } from './chat.js';
import { credentialsRoutes, type CredentialsApi } from './credentials.js';
import { eventsRoutes, type EventsApi } from './events.js';
import { healthRoutes, type HealthApi } from './health.js';
import { licenseRoutes, type LicenseApi } from './license.js';
import { lobehubRoutes, type LobeHubApi } from './lobehub.js';
import { overviewRoutes, type OverviewApi } from './overview.js';
import { positionsRoutes, type PositionsApi } from './positions.js';
import { researchRoutes, type ResearchApi } from './research.js';
import { settingsRoutes, type SettingsApi } from './settings.js';
import { symbolsRoutes, type SymbolsApi } from './symbols.js';

export interface AppApi {
  assistant: AssistantApi;
  canvas: CanvasApi;
  capabilities: CapabilitiesApi;
  charts: ChartsApi;
  chat: ChatApi;
  events: EventsApi;
  symbols: SymbolsApi;
  agentKit: AgentKitApi;
  annotations: AnnotationsApi;
  positions: PositionsApi;
  research: ResearchApi;
  overview: OverviewApi;
  settings: SettingsApi;
  credentials: CredentialsApi;
  health: HealthApi;
  lobehub: LobeHubApi;
  license: LicenseApi;
}

// Groups whose operations only ever travel over the desktop IPC bridge. They keep
// route metadata so the typed client can address them uniformly, but the HTTP host
// deliberately does not serve them: agentKit mutates the user's filesystem and
// shell state, which has no business behind an HTTP endpoint. The web client
// reaches these through rpc.invoke, never through the HTTP client.
export const IPC_ONLY_ROUTE_GROUPS: readonly string[] = ['agentKit'];

export const allRoutes = {
  assistant: assistantRoutes,
  canvas: canvasRoutes,
  capabilities: capabilitiesRoutes,
  charts: chartsRoutes,
  chat: chatRoutes,
  events: eventsRoutes,
  symbols: symbolsRoutes,
  agentKit: agentKitRoutes,
  annotations: annotationsRoutes,
  positions: positionsRoutes,
  research: researchRoutes,
  overview: overviewRoutes,
  settings: settingsRoutes,
  credentials: credentialsRoutes,
  health: healthRoutes,
  lobehub: lobehubRoutes,
  license: licenseRoutes,
};

export * from './agentKit.js';
export * from './annotations.js';
export * from './assistant.js';
export * from './canvas.js';
export * from './capabilities.js';
export * from './charts.js';
export * from './chat.js';
export * from './credentials.js';
export * from './defineRoutes.js';
export * from './events.js';
export * from './health.js';
export * from './license.js';
export * from './lobehub.js';
export * from './overview.js';
export * from './positions.js';
export * from './research.js';
export * from './settings.js';
export * from './symbols.js';
