import { BrowserWindow } from 'electron';
import { TABS_COMMAND_CHANNEL, type TabsCommand } from './channels.js';

export function sendTabsCommand(command: TabsCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(TABS_COMMAND_CHANNEL, command);
}
