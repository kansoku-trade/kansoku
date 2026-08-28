export const KERNEL_IPC_GROUPS = [
  'assistant',
  'canvas',
  'capabilities',
  'charts',
  'chat',
  'symbols',
  'agentKit',
  'annotations',
  'positions',
  'research',
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
  'trainer',
] as const;

export const IPC_GROUPS = [...KERNEL_IPC_GROUPS, ...SHELL_IPC_GROUPS] as const;
