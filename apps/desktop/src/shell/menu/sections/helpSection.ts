import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActionDeps } from '../types.js';

export function buildHelpSection(deps: MenuActionDeps): MenuItemConstructorOptions {
  return {
    role: 'help',
    label: '帮助',
    submenu: [
      {
        label: '查看日志…',
        click: () => deps.openLogs(),
      },
      { type: 'separator' },
      {
        label: '显示 Agent Workspace…',
        click: () => deps.openWorkspace(),
      },
      {
        label: '导入 Kansoku 数据…',
        click: () => deps.importFromRepo(),
      },
    ],
  };
}
