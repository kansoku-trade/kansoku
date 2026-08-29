import * as stylex from '@stylexjs/stylex';
import { ArrowBigUp, Command, CornerDownLeft, type LucideIcon } from 'lucide-react';
import { fonts } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    alignItems: 'center',
    color: 'inherit',
    display: 'inline-flex',
    fontFamily: fonts.mono,
    fontSize: 'inherit',
    fontWeight: 400,
    gap: '1px',
    lineHeight: 1,
    verticalAlign: '-1px',
  },
  icon: {
    height: '1em',
    strokeWidth: 1.8,
    width: '1em',
  },
});

type KbdKey = 'mod' | 'shift' | 'enter' | (string & {});

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
  const styleClassName = stylex.props(styles.root).className;
  const labels = keys.map((key) => {
    if (key === 'mod') return apple ? 'Command' : 'Control';
    return ICON_KEYS[key]?.label ?? key.toUpperCase();
  });

  return (
    <kbd
      className={`ui-kbd ${styleClassName}${className ? ` ${className}` : ''}`}
      aria-label={labels.join('+')}
    >
      {keys.map((key, index) => {
        const iconKey = key === 'mod' && apple ? COMMAND_KEY : ICON_KEYS[key];
        if (iconKey) {
          const Icon = iconKey.icon;
          return (
            <Icon
              key={`${key}-${index}`}
              aria-hidden
              className={stylex.props(styles.icon).className}
            />
          );
        }
        return <span key={`${key}-${index}`}>{key === 'mod' ? 'Ctrl' : key.toUpperCase()}</span>;
      })}
    </kbd>
  );
}
