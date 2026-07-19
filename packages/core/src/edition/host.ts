import type { ProLicenseGate, SecretBox } from '@kansoku/pro-api';
import type { SettingsStore } from '../ai/settingsStore.js';
import type { Db } from '../db/index.js';
import type { WatchedMarketsStore } from '../services/watchedMarketsStore.js';

export interface EditionPaths {
  kansokuHome: string;
}

export interface CoreEditionHost {
  db: Db;
  license: ProLicenseGate;
  aiSettings: SettingsStore | null;
  watchedMarkets: WatchedMarketsStore | null;
  paths: EditionPaths;
  secretBox?: SecretBox;
  aiRuntimeAlreadyInitialized?: boolean;
  production: boolean;
}

export interface ServerEditionHost extends CoreEditionHost {}

export interface DesktopEditionHost extends CoreEditionHost {
  relaunch?: () => void;
}
