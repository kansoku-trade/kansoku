let restartPending = false;

export function getDataRootRestartPending(): boolean {
  return restartPending;
}

export function markDataRootRestartPending(): void {
  restartPending = true;
}
