export const KERNEL_IPC_GROUPS = [
  'assistant',
  'canvas',
  'capabilities',
  'charts',
  'chat',
  'events',
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
  'workspace',
  'icloud',
  'tabs',
  'windows',
  'logs',
  'contextMenu',
  'updater',
  'trainer',
  'devtools',
] as const;

export const IPC_GROUPS = [...KERNEL_IPC_GROUPS, ...SHELL_IPC_GROUPS] as const;
