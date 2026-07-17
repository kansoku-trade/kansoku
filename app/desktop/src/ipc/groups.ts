export const IPC_GROUPS = [
  "assistant",
  "capabilities",
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
  "license",
] as const;

export type IpcGroup = (typeof IPC_GROUPS)[number];
