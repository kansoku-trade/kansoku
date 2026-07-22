export interface DeepLinkTarget {
  path: string;
  search: string;
}

export interface DesktopDeepLinkBridge {
  onNavigate(cb: (target: DeepLinkTarget) => void): () => void;
}

interface DesktopGlobal {
  deepLink?: {
    onNavigate?(cb: (target: DeepLinkTarget) => void): () => void;
  };
}

function getDeepLinkPush(win: unknown): DesktopGlobal['deepLink'] | undefined {
  return (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.deepLink;
}

export function getDesktopDeepLinkBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopDeepLinkBridge | null {
  const push = getDeepLinkPush(win);
  if (!push?.onNavigate) return null;
  return { onNavigate: push.onNavigate.bind(push) };
}
