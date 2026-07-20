import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActionDeps } from '../types.js';

export function buildDebugSection(deps: MenuActionDeps): MenuItemConstructorOptions | null {
  const devLicense = deps.devLicense;
  if (!devLicense) return null;
  const unlicensed = devLicense.isUnlicensed();
  return {
    label: '调试',
    submenu: [
      {
        label: '许可：已激活',
        type: 'radio',
        checked: !unlicensed,
        click: () => devLicense.set(false),
      },
      {
        label: '许可：未激活（模拟）',
        type: 'radio',
        checked: unlicensed,
        click: () => devLicense.set(true),
      },
    ],
  };
}
