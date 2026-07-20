export type MenuActionDeps = {
  openAbout: () => void;
  importFromRepo: () => void;
  selectDataRoot: () => void;
  openSettings: () => void;
  openLogs: () => void;
  openResearch: () => void;
  openChat: () => void;
  checkForUpdates: () => void;
  newWindow: () => void;
  newTab: () => void;
  closeTab: () => void;
  nextTab: () => void;
  prevTab: () => void;
  devLicense?: {
    isUnlicensed: () => boolean;
    set: (unlicensed: boolean) => void;
  };
};

export type AppMenuManager = {
  install: () => void;
  rebuild: () => void;
};
