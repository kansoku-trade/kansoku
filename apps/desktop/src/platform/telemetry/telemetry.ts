import { app, ipcMain } from 'electron';
import { VibeLoftTelemetry } from '@vibeloft/telemetry-electron';
import { TELEMETRY_CHANNELS } from './channels.js';

const PRODUCT_ID = 'bab5dcef-e4c5-4aad-bbb6-0b88156216c7';
const APP_ID = 'dev.innei.kansoku';
// vl_native.* is VibeLoft's public write key class (client-embedded by design,
// like any client-side analytics key) — not a secret in the .env sense.
const AUTH_KEY = 'vl_native.b4chhhnFgVKjplL69gB933pyPIAbGrjRSU1EPvwK06k';

// Screen names arriving over IPC are renderer input. Only names in this map
// ever reach the adapter, and only as these fixed routes — never URLs, titles,
// symbols, or anything else the renderer composed.
const SCREEN_ROUTES: Readonly<Record<string, string>> = {
  home: '/home',
  overview: '/overview',
  charts: '/charts',
  chart: '/chart',
  symbol: '/symbol',
  sepa_symbol: '/symbol/sepa',
  research: '/research',
  assistant: '/chat',
  training_stats: '/training/stats',
  settings: '/settings',
  about: '/about',
  logs: '/logs',
};

export interface DesktopTelemetry {
  close(): void;
}

export async function initTelemetry(): Promise<DesktopTelemetry | null> {
  let client: VibeLoftTelemetry | null = null;

  ipcMain.handle(TELEMETRY_CHANNELS.screen, (_event, name: unknown) => {
    const route = typeof name === 'string' ? SCREEN_ROUTES[name] : undefined;
    if (route && client) client.trackScreen(route);
  });

  try {
    client = await VibeLoftTelemetry.create({
      productId: PRODUCT_ID,
      authKey: AUTH_KEY,
      appId: APP_ID,
      // Never hand the adapter the real `app`: its lifecycle hook intercepts
      // before-quit with preventDefault + re-quit, which Sparkle treats as a
      // cancelled install (see the before-quit comment in main.ts). Without an
      // `on` method it skips that hook entirely; events not flushed by its 15s
      // interval persist to disk and deliver on the next launch instead.
      app: {
        getPath: (name: string) => app.getPath(name as Parameters<typeof app.getPath>[0]),
        getLocale: () => app.getLocale(),
      },
    });
  } catch (error) {
    console.error('[desktop] vibeloft telemetry init failed', error);
    return null;
  }

  console.info('[desktop] vibeloft telemetry enabled');
  const active = client;
  return {
    close: () => {
      active.close({ flushPending: true }).catch(() => {});
    },
  };
}
