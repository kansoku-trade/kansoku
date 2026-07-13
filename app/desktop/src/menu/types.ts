export type MenuActionDeps = {
  importFromRepo: () => void;
  selectDataRoot: () => void;
  openSettings: () => void;
  openLogs: () => void;
  checkForUpdates: () => void;
  newTab: () => void;
  closeTab: () => void;
  nextTab: () => void;
  prevTab: () => void;
};

export type AppMenuManager = {
  install: () => void;
  rebuild: () => void;
};
