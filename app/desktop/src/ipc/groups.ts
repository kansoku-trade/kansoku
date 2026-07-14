export const IPC_GROUPS = [
  "charts",
  "chat",
  "symbols",
  "annotations",
  "positions",
  "research",
  "overview",
  "settings",
  "credentials",
  "health",
  "lobehub",
] as const;

export type IpcGroup = (typeof IPC_GROUPS)[number];
