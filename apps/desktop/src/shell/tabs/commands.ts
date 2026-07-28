import { BrowserWindow } from 'electron';
import { TABS_COMMAND_CHANNEL, type TabsCommand } from './channels.js';

export function sendTabsCommand(command: TabsCommand, target?: BrowserWindow | null): void {
  const win = target === undefined ? BrowserWindow.getFocusedWindow() : target;
  win?.webContents.send(TABS_COMMAND_CHANNEL, command);
}
