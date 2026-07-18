import { Menu } from "electron";
import { buildAppSectionWithName } from "./sections/appSection.js";
import { buildEditSection } from "./sections/editSection.js";
import { buildGoSection } from "./sections/goSection.js";
import { buildHelpSection } from "./sections/helpSection.js";
import { buildViewSection } from "./sections/viewSection.js";
import { buildWindowSection } from "./sections/windowSection.js";
import type { AppMenuManager, MenuActionDeps } from "./types.js";

export type CreateAppMenuManagerOptions = {
  appName: string;
  deps: MenuActionDeps;
  setApplicationMenu?: (menu: Menu) => void;
  buildFromTemplate?: (template: Electron.MenuItemConstructorOptions[]) => Menu;
};

export function buildAppMenuTemplate(
  appName: string,
  deps: MenuActionDeps,
): Electron.MenuItemConstructorOptions[] {
  return [
    buildAppSectionWithName(appName, deps),
    buildEditSection(),
    buildViewSection(),
    buildGoSection(deps),
    buildWindowSection(deps),
    buildHelpSection(deps),
  ];
}

export function createAppMenuManager(options: CreateAppMenuManagerOptions): AppMenuManager {
  const setApplicationMenu = options.setApplicationMenu ?? ((menu) => Menu.setApplicationMenu(menu));
  const buildFromTemplate = options.buildFromTemplate ?? ((template) => Menu.buildFromTemplate(template));

  const apply = () => {
    const template = buildAppMenuTemplate(options.appName, options.deps);
    setApplicationMenu(buildFromTemplate(template));
  };

  return {
    install: apply,
    rebuild: apply,
  };
}
