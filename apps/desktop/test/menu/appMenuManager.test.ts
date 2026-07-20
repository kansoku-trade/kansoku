import { describe, expect, it, vi } from 'vitest';
import { buildAppMenuTemplate, createAppMenuManager } from '@desktop/shell/menu/appMenuManager.js';
import type { MenuActionDeps } from '@desktop/shell/menu/types.js';

function makeDeps(overrides: Partial<MenuActionDeps> = {}): MenuActionDeps {
  return {
    openAbout: vi.fn(),
    importFromRepo: vi.fn(),
    selectDataRoot: vi.fn(),
    openSettings: vi.fn(),
    openLogs: vi.fn(),
    openResearch: vi.fn(),
    openChat: vi.fn(),
    checkForUpdates: vi.fn(),
    newWindow: vi.fn(),
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
  if (!Array.isArray(submenu)) throw new Error('expected array submenu');
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

describe('buildAppMenuTemplate', () => {
  it('builds app / edit / view / go / window / help top-level sections', () => {
    const template = buildAppMenuTemplate('Kansoku', makeDeps());
    expect(template.map((item) => item.label ?? item.role)).toEqual([
      'Kansoku',
      '编辑',
      '显示',
      '前往',
      '窗口',
      '帮助',
    ]);
  });

  it('puts chat and research in the go menu and wires clicks to deps', () => {
    const deps = makeDeps();
    const goMenu = asSubmenu(buildAppMenuTemplate('Kansoku', deps)[3]);
    expect(findByLabel(goMenu, 'AI 对话').accelerator).toBe('CmdOrCtrl+L');
    expect(findByLabel(goMenu, '研究库').accelerator).toBe('CmdOrCtrl+Shift+L');
    findByLabel(goMenu, 'AI 对话').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(goMenu, '研究库').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(deps.openChat).toHaveBeenCalledOnce();
    expect(deps.openResearch).toHaveBeenCalledOnce();
  });

  it('keeps about, check updates, settings, and quit in the app menu', () => {
    const deps = makeDeps();
    const appMenu = asSubmenu(buildAppMenuTemplate('Kansoku', deps)[0]);
    findByLabel(appMenu, '关于 Kansoku').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(deps.openAbout).toHaveBeenCalledOnce();
    expect(findByLabel(appMenu, '检查更新…').label).toBe('检查更新…');
    expect(findByLabel(appMenu, '设置…')).toMatchObject({
      label: '设置…',
      accelerator: 'CmdOrCtrl+,',
    });
    expect(findByRole(appMenu, 'quit').role).toBe('quit');
    expect(appMenu.some((item) => item.label === '查看日志…')).toBe(false);
    expect(appMenu.some((item) => item.label === '选择数据目录…')).toBe(false);
    expect(appMenu.some((item) => item.label === '从 repo 导入数据…')).toBe(false);
  });

  it('wires app menu clicks to deps', () => {
    const deps = makeDeps();
    const appMenu = asSubmenu(buildAppMenuTemplate('Kansoku', deps)[0]);
    findByLabel(appMenu, '检查更新…').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(appMenu, '设置…').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(deps.checkForUpdates).toHaveBeenCalledOnce();
    expect(deps.openSettings).toHaveBeenCalledOnce();
  });

  it('puts logs and data tools in the help menu', () => {
    const deps = makeDeps();
    const helpMenu = asSubmenu(buildAppMenuTemplate('Kansoku', deps)[5]);
    expect(findByLabel(helpMenu, '查看日志…').label).toBe('查看日志…');
    expect(findByLabel(helpMenu, '选择数据目录…').label).toBe('选择数据目录…');
    expect(findByLabel(helpMenu, '从 repo 导入数据…').label).toBe('从 repo 导入数据…');

    findByLabel(helpMenu, '查看日志…').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(helpMenu, '选择数据目录…').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(helpMenu, '从 repo 导入数据…').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(deps.openLogs).toHaveBeenCalledOnce();
    expect(deps.selectDataRoot).toHaveBeenCalledOnce();
    expect(deps.importFromRepo).toHaveBeenCalledOnce();
  });

  it('includes tab actions and avoids role close on close-tab', () => {
    const deps = makeDeps();
    const windowMenu = asSubmenu(buildAppMenuTemplate('Kansoku', deps)[4]);
    const closeTab = findByLabel(windowMenu, '关闭标签页');
    expect(closeTab).toMatchObject({
      label: '关闭标签页',
      accelerator: 'CmdOrCtrl+W',
    });
    expect(closeTab.role).toBeUndefined();
    expect(findByLabel(windowMenu, '新建标签页').accelerator).toBe('CmdOrCtrl+T');
    expect(findByRole(windowMenu, 'minimize').role).toBe('minimize');
    expect(findByRole(windowMenu, 'front').role).toBe('front');
  });

  it('wires window tab clicks to deps', () => {
    const deps = makeDeps();
    const windowMenu = asSubmenu(buildAppMenuTemplate('Kansoku', deps)[4]);
    findByLabel(windowMenu, '新建窗口').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(windowMenu, '新建标签页').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(windowMenu, '关闭标签页').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(windowMenu, '下一个标签页').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(windowMenu, '上一个标签页').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(deps.newWindow).toHaveBeenCalledOnce();
    expect(deps.newTab).toHaveBeenCalledOnce();
    expect(deps.closeTab).toHaveBeenCalledOnce();
    expect(deps.nextTab).toHaveBeenCalledOnce();
    expect(deps.prevTab).toHaveBeenCalledOnce();
  });

  it('includes standard edit and view roles', () => {
    const template = buildAppMenuTemplate('Kansoku', makeDeps());
    const edit = asSubmenu(template[1]);
    const view = asSubmenu(template[2]);
    expect(findByRole(edit, 'copy').role).toBe('copy');
    expect(findByRole(edit, 'paste').role).toBe('paste');
    expect(findByRole(view, 'reload').role).toBe('reload');
    expect(findByRole(view, 'toggleDevTools').role).toBe('toggleDevTools');
    expect(findByRole(view, 'togglefullscreen').role).toBe('togglefullscreen');
  });
});

describe('debug section', () => {
  it('is absent without devLicense deps', () => {
    const template = buildAppMenuTemplate('Kansoku', makeDeps());
    expect(template.some((item) => item.label === '调试')).toBe(false);
  });

  it('renders radio state from isUnlicensed and wires clicks to set', () => {
    const set = vi.fn();
    const deps = makeDeps({ devLicense: { isUnlicensed: () => true, set } });
    const template = buildAppMenuTemplate('Kansoku', deps);
    expect(template.map((item) => item.label ?? item.role)).toEqual([
      'Kansoku',
      '编辑',
      '显示',
      '前往',
      '窗口',
      '调试',
      '帮助',
    ]);
    const debugMenu = asSubmenu(findByLabel(template, '调试'));
    expect(findByLabel(debugMenu, '许可：已激活')).toMatchObject({ type: 'radio', checked: false });
    expect(findByLabel(debugMenu, '许可：未激活（模拟）')).toMatchObject({
      type: 'radio',
      checked: true,
    });
    findByLabel(debugMenu, '许可：已激活').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    findByLabel(debugMenu, '许可：未激活（模拟）').click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(set).toHaveBeenNthCalledWith(1, false);
    expect(set).toHaveBeenNthCalledWith(2, true);
  });
});

describe('createAppMenuManager', () => {
  it('install and rebuild both set the application menu from the template', () => {
    const setApplicationMenu = vi.fn();
    const fakeMenu = { id: 'menu' } as unknown as Electron.Menu;
    const buildFromTemplate = vi.fn().mockReturnValue(fakeMenu);
    const manager = createAppMenuManager({
      appName: 'Kansoku',
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
