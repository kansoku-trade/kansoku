export interface NavigationGuardOptions {
  devUrl?: string;
}

export function isAllowedNavigationUrl(
  targetUrl: string,
  options: NavigationGuardOptions = {},
): boolean {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return false;
  }

  if (target.protocol === 'app:') return true;

  if (options.devUrl) {
    try {
      if (target.origin === new URL(options.devUrl).origin) return true;
    } catch {
      // malformed devUrl configuration — fall through to reject
    }
  }

  return false;
}

export function isExternalHttpUrl(targetUrl: string): boolean {
  try {
    const { protocol } = new URL(targetUrl);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
