import { ArrowBigUp, Command, CornerDownLeft, type LucideIcon } from 'lucide-react';

export type KbdKey = 'mod' | 'shift' | 'enter' | (string & {});

interface KbdProps {
  keys: readonly KbdKey[];
  className?: string;
}

const ICON_KEYS: Partial<Record<KbdKey, { icon: LucideIcon; label: string }>> = {
  enter: { icon: CornerDownLeft, label: 'Enter' },
  shift: { icon: ArrowBigUp, label: 'Shift' },
};
const COMMAND_KEY = { icon: Command, label: 'Command' } as const;

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

export function Kbd({ keys, className }: KbdProps) {
  const apple = isApplePlatform();
  const labels = keys.map((key) => {
    if (key === 'mod') return apple ? 'Command' : 'Control';
    return ICON_KEYS[key]?.label ?? key.toUpperCase();
  });

  return (
    <kbd className={`ui-kbd${className ? ` ${className}` : ''}`} aria-label={labels.join('+')}>
      {keys.map((key, index) => {
        const iconKey = key === 'mod' && apple ? COMMAND_KEY : ICON_KEYS[key];
        if (iconKey) {
          const Icon = iconKey.icon;
          return <Icon key={`${key}-${index}`} aria-hidden />;
        }
        return <span key={`${key}-${index}`}>{key === 'mod' ? 'Ctrl' : key.toUpperCase()}</span>;
      })}
    </kbd>
  );
}
