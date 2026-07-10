export interface CredentialsStatusReload {
  reloadStoreStatus: () => void;
  reloadServerStatus: () => void;
}

export function refreshAfterSave(reload: CredentialsStatusReload, clearRestricted: () => void): void {
  reload.reloadStoreStatus();
  reload.reloadServerStatus();
  clearRestricted();
}

export function refreshAfterClear(reload: CredentialsStatusReload): void {
  reload.reloadStoreStatus();
  reload.reloadServerStatus();
}
