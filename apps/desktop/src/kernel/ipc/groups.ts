export const KERNEL_IPC_GROUPS = [
  'assistant',
  'capabilities',
  'charts',
  'chat',
  'symbols',
  'annotations',
  'positions',
  'research',
  'hypotheses',
  'overview',
  'settings',
  'credentials',
  'health',
  'lobehub',
  'license',
] as const;

export const SHELL_IPC_GROUPS = [
  'onboarding',
  'appControl',
  'dataRoot',
  'tabs',
  'windows',
  'logs',
  'contextMenu',
  'updater',
] as const;

export const IPC_GROUPS = [...KERNEL_IPC_GROUPS, ...SHELL_IPC_GROUPS] as const;

export type IpcGroup = (typeof IPC_GROUPS)[number];
