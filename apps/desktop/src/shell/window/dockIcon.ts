import { existsSync } from 'node:fs';
import { app } from 'electron';
import { APP_ICON_PNG } from './mainWindow.js';

export function applyDevDockIcon() {
  // Packaged macOS builds pick up build/icon.icns from the .app bundle.
  // Dev still runs as Electron.app, so set Dock icon from the brand PNG.
  if (app.isPackaged || process.platform !== 'darwin') return;
  if (!app.dock || !existsSync(APP_ICON_PNG)) return;
  app.dock.setIcon(APP_ICON_PNG);
}
