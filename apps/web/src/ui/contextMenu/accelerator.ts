/**
 * Format an Electron-style accelerator for on-screen display.
 * Does not register keybindings — only presentation for Web menus.
 */
export function formatAcceleratorForDisplay(
  accelerator: string,
  platform: 'mac' | 'other' = detectPlatform(),
): string {
  const isMac = platform === 'mac';
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const mapped = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === 'cmdorctrl' || lower === 'commandorcontrol') return isMac ? '⌘' : 'Ctrl';
    if (lower === 'cmd' || lower === 'command' || lower === 'super' || lower === 'meta') {
      return isMac ? '⌘' : 'Meta';
    }
    if (lower === 'ctrl' || lower === 'control') return isMac ? '⌃' : 'Ctrl';
    if (lower === 'alt' || lower === 'option') return isMac ? '⌥' : 'Alt';
    if (lower === 'shift') return isMac ? '⇧' : 'Shift';
    if (lower === 'enter' || lower === 'return') return isMac ? '⏎' : 'Enter';
    if (lower === 'escape' || lower === 'esc') return isMac ? '⎋' : 'Esc';
    if (lower === 'backspace') return isMac ? '⌫' : 'Backspace';
    if (lower === 'delete') return isMac ? '⌦' : 'Delete';
    if (lower === 'up') return '↑';
    if (lower === 'down') return '↓';
    if (lower === 'left') return '←';
    if (lower === 'right') return '→';
    if (part.length === 1) return part.toUpperCase();
    return part;
  });

  if (isMac) return mapped.join('');
  return mapped.join('+');
}

export function resolveShortcutDisplay(
  item: {
    accelerator?: string;
    shortcut?: string;
  },
  platform?: 'mac' | 'other',
): string | undefined {
  if (item.shortcut) return item.shortcut;
  if (item.accelerator) return formatAcceleratorForDisplay(item.accelerator, platform);
  return undefined;
}

function detectPlatform(): 'mac' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent) ? 'mac' : 'other';
}
