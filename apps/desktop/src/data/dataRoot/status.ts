export type DataRootMode = 'default' | 'custom' | 'env' | 'dev-repo';

export interface DataRootStatus {
  effectivePath: string;
  configuredPath: string | null;
  mode: DataRootMode;
  degraded: boolean;
  degradedReason?: string;
}

export function buildDataRootStatus(input: {
  isPackaged: boolean;
  envOverride?: string;
  userDataPath: string;
  configuredPath: string | null;
  effectivePath: string;
  customPathUsable: boolean;
}): DataRootStatus {
  const { isPackaged, envOverride, configuredPath, effectivePath, customPathUsable } = input;

  let mode: DataRootMode;
  if (envOverride) {
    mode = 'env';
  } else if (!isPackaged) {
    mode = 'dev-repo';
  } else if (configuredPath && customPathUsable) {
    mode = 'custom';
  } else {
    mode = 'default';
  }

  const degraded = Boolean(configuredPath) && !customPathUsable && !envOverride && isPackaged;

  if (degraded) {
    return {
      effectivePath,
      configuredPath,
      mode,
      degraded: true,
      degradedReason: 'configured data root is missing or not writable',
    };
  }

  return {
    effectivePath,
    configuredPath,
    mode,
    degraded: false,
  };
}
