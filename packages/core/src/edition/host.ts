import type { ProLicenseGate, SecretBox } from '@kansoku/pro-api';
import type { SettingsStore } from '../ai/settingsStore.js';
import type { Db } from '../db/index.js';
import { getDb } from '../db/index.js';
import { KANSOKU_HOME } from '../env.js';
import type { WatchedMarketsStore } from '../services/watchedMarketsStore.js';

export interface EditionPaths {
  kansokuHome: string;
}

export interface Logger {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
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
  logger?: Logger;
}

export interface ServerEditionHost extends CoreEditionHost {}

export interface DesktopEditionHost extends CoreEditionHost {
  relaunch?: () => void;
}

export function createDefaultServerEditionHost(
  overrides?: Partial<ServerEditionHost>,
): ServerEditionHost {
  return {
    db: getDb(),
    license: { isLicensed: () => false },
    aiSettings: null,
    watchedMarkets: null,
    paths: { kansokuHome: KANSOKU_HOME },
    production: false,
    ...overrides,
  };
}
