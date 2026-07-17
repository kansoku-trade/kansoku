import type { IpcServiceConstructor } from "electron-ipc-decorator";
import { getPro } from "../../../packages/core/src/pro/registry.js";
import { AnnotationsIpc } from "./annotationsIpc.js";
import { CapabilitiesIpc } from "./capabilitiesIpc.js";
import { ChartsIpc } from "./chartsIpc.js";
import { CredentialsIpc } from "./credentialsIpc.js";
import { HealthIpc } from "./healthIpc.js";
import { OverviewIpc } from "./overviewIpc.js";
import { PositionsIpc } from "./positionsIpc.js";
import { SettingsIpc } from "./settingsIpc.js";
import { SymbolsIpc } from "./symbolsIpc.js";

const nonAiIpcServiceClasses = [
  ChartsIpc,
  SymbolsIpc,
  AnnotationsIpc,
  PositionsIpc,
  OverviewIpc,
  SettingsIpc,
  CredentialsIpc,
  HealthIpc,
  CapabilitiesIpc,
] as const;

const aiIpcServiceClasses = (getPro()?.ipcServiceClasses ?? []) as IpcServiceConstructor[];

export const ipcServiceClasses = [...nonAiIpcServiceClasses, ...aiIpcServiceClasses] as const;
