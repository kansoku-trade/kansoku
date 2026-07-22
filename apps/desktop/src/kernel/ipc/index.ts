import { AgentKitIpc } from '../../agent-kit/ipc.js';
import { AnnotationsIpc } from './annotationsIpc.js';
import { AssistantIpc } from './assistantIpc.js';
import { CapabilitiesIpc } from './capabilitiesIpc.js';
import { ChartsIpc } from './chartsIpc.js';
import { ChatIpc } from './chatIpc.js';
import { CredentialsIpc } from './credentialsIpc.js';
import { HealthIpc } from './healthIpc.js';
import { LicenseIpc } from './licenseIpc.js';
import { LobeHubIpc } from './lobehubIpc.js';
import { OverviewIpc } from './overviewIpc.js';
import { PositionsIpc } from './positionsIpc.js';
import { ResearchIpc } from './researchIpc.js';
import { SettingsIpc } from './settingsIpc.js';
import { SymbolsIpc } from './symbolsIpc.js';

export const ipcServiceClasses = [
  AgentKitIpc,
  ChartsIpc,
  SymbolsIpc,
  AnnotationsIpc,
  PositionsIpc,
  OverviewIpc,
  SettingsIpc,
  AssistantIpc,
  ChatIpc,
  ResearchIpc,
  LobeHubIpc,
  CredentialsIpc,
  HealthIpc,
  CapabilitiesIpc,
  LicenseIpc,
] as const;
