import { AnnotationsIpc } from "./annotationsIpc.js";
import { AssistantIpc } from "./assistantIpc.js";
import { ChartsIpc } from "./chartsIpc.js";
import { ChatIpc } from "./chatIpc.js";
import { CredentialsIpc } from "./credentialsIpc.js";
import { HealthIpc } from "./healthIpc.js";
import { LobeHubIpc } from "./lobehubIpc.js";
import { OverviewIpc } from "./overviewIpc.js";
import { PositionsIpc } from "./positionsIpc.js";
import { ResearchIpc } from "./researchIpc.js";
import { SettingsIpc } from "./settingsIpc.js";
import { SymbolsIpc } from "./symbolsIpc.js";

export const ipcServiceClasses = [
  AssistantIpc,
  ChartsIpc,
  ChatIpc,
  SymbolsIpc,
  AnnotationsIpc,
  PositionsIpc,
  ResearchIpc,
  OverviewIpc,
  SettingsIpc,
  CredentialsIpc,
  HealthIpc,
  LobeHubIpc,
] as const;
