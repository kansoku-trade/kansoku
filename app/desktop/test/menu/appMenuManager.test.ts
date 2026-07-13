import { describe, expect, it, vi } from "vitest";
import { buildAppMenuTemplate, createAppMenuManager } from "../../src/menu/appMenuManager.js";
import type { MenuActionDeps } from "../../src/menu/types.js";

function makeDeps(overrides: Partial<MenuActionDeps> = {}): MenuActionDeps {
  return {
    importFromRepo: vi.fn(),
    selectDataRoot: vi.fn(),
    openSettings: vi.fn(),
    checkForUpdates: vi.fn(),
    newTab: vi.fn(),
    closeTab: vi.fn(),
    nextTab: vi.fn(),
    prevTab: vi.fn(),
    ...overrides,
  };
}

function asSubmenu(
  item: Electron.MenuItemConstructorOptions,
): Electron.MenuItemConstructorOptions[] {
  const submenu = item.submenu;
  if (!Array.isArray(submenu)) throw new Error("expected array submenu");
  return submenu;
}

function findByLabel(
  items: Electron.MenuItemConstructorOptions[],
  label: string,
): Electron.MenuItemConstructorOptions {
  const found = items.find((item) => item.label === label);
  if (!found) throw new Error(`missing label: ${label}`);
  return found;
}

function findByRole(
  items: Electron.MenuItemConstructorOptions[],
  role: string,
): Electron.MenuItemConstructorOptions {
  const found = items.find((item) => item.role === role);
  if (!found) throw new Error(`missing role: ${role}`);
  return found;
}

describe("buildAppMenuTemplate", () => {
  it("builds app / edit / view / window top-level sections", () => {
    const template = buildAppMenuTemplate("Kansoku", makeDeps());
    expect(template.map((item) => item.label ?? item.role)).toEqual([
      "Kansoku",
      "编辑",
      "显示",
      "窗口",
    ]);
  });

  it("includes about, check updates, import, select data root, settings, and quit in the app menu", () => {
    const deps = makeDeps();
    const appMenu = asSubmenu(buildAppMenuTemplate("Kansoku", deps)[0]);
    expect(findByRole(appMenu, "about").role).toBe("about");
    expect(findByLabel(appMenu, "检查更新…").label).toBe("检查更新…");
    expect(findByLabel(appMenu, "从 repo 导入数据…").label).toBe("从 repo 导入数据…");
    expect(findByLabel(appMenu, "选择数据目录…").label).toBe("选择数据目录…");
    expect(findByLabel(appMenu, "设置…")).toMatchObject({
      label: "设置…",
      accelerator: "CmdOrCtrl+,",
    });
    expect(findByRole(appMenu, "quit").role).toBe("quit");
  });

  it("wires app menu clicks to deps", () => {
    const deps = makeDeps();
    const appMenu = asSubmenu(buildAppMenuTemplate("Kansoku", deps)[0]);
    findByLabel(appMenu, "检查更新…").click?.(undefined as never, undefined as never, undefined as never);
    findByLabel(appMenu, "从 repo 导入数据…").click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(appMenu, "选择数据目录…").click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(appMenu, "设置…").click?.(undefined as never, undefined as never, undefined as never);
    expect(deps.checkForUpdates).toHaveBeenCalledOnce();
    expect(deps.importFromRepo).toHaveBeenCalledOnce();
    expect(deps.selectDataRoot).toHaveBeenCalledOnce();
    expect(deps.openSettings).toHaveBeenCalledOnce();
  });

  it("includes tab actions and avoids role close on close-tab", () => {
    const deps = makeDeps();
    const windowMenu = asSubmenu(buildAppMenuTemplate("Kansoku", deps)[3]);
    const closeTab = findByLabel(windowMenu, "关闭标签页");
    expect(closeTab).toMatchObject({
      label: "关闭标签页",
      accelerator: "CmdOrCtrl+W",
    });
    expect(closeTab.role).toBeUndefined();
    expect(findByLabel(windowMenu, "新建标签页").accelerator).toBe("CmdOrCtrl+T");
    expect(findByRole(windowMenu, "minimize").role).toBe("minimize");
    expect(findByRole(windowMenu, "front").role).toBe("front");
  });

  it("wires window tab clicks to deps", () => {
    const deps = makeDeps();
    const windowMenu = asSubmenu(buildAppMenuTemplate("Kansoku", deps)[3]);
    findByLabel(windowMenu, "新建标签页").click?.(undefined as never, undefined as never, undefined as never);
    findByLabel(windowMenu, "关闭标签页").click?.(undefined as never, undefined as never, undefined as never);
    findByLabel(windowMenu, "下一个标签页").click?.(undefined as never, undefined as never, undefined as never);
    findByLabel(windowMenu, "上一个标签页").click?.(undefined as never, undefined as never, undefined as never);
    expect(deps.newTab).toHaveBeenCalledOnce();
    expect(deps.closeTab).toHaveBeenCalledOnce();
    expect(deps.nextTab).toHaveBeenCalledOnce();
    expect(deps.prevTab).toHaveBeenCalledOnce();
  });

  it("includes standard edit and view roles", () => {
    const template = buildAppMenuTemplate("Kansoku", makeDeps());
    const edit = asSubmenu(template[1]);
    const view = asSubmenu(template[2]);
    expect(findByRole(edit, "copy").role).toBe("copy");
    expect(findByRole(edit, "paste").role).toBe("paste");
    expect(findByRole(view, "reload").role).toBe("reload");
    expect(findByRole(view, "toggleDevTools").role).toBe("toggleDevTools");
    expect(findByRole(view, "togglefullscreen").role).toBe("togglefullscreen");
  });
});

describe("createAppMenuManager", () => {
  it("install and rebuild both set the application menu from the template", () => {
    const setApplicationMenu = vi.fn();
    const fakeMenu = { id: "menu" } as unknown as Electron.Menu;
    const buildFromTemplate = vi.fn().mockReturnValue(fakeMenu);
    const manager = createAppMenuManager({
      appName: "Kansoku",
      deps: makeDeps(),
      setApplicationMenu,
      buildFromTemplate,
    });
    manager.install();
    manager.rebuild();
    expect(buildFromTemplate).toHaveBeenCalledTimes(2);
    expect(setApplicationMenu).toHaveBeenCalledTimes(2);
    expect(setApplicationMenu).toHaveBeenCalledWith(fakeMenu);
  });
});
