import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, fonts, radii } from '../theme/tokens.stylex';

type BadgeProps = {
  tone?: 'up' | 'down' | 'accent' | 'solid' | 'muted';
} & HTMLAttributes<HTMLSpanElement>;

const styles = stylex.create({
  base: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.default,
    color: colors.textSecondary,
    display: 'inline-block',
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    letterSpacing: '0.05em',
    padding: '1px 6px',
    textTransform: 'uppercase',
  },
  up: {
    color: colors.up,
  },
  down: {
    color: colors.down,
  },
  accent: {
    color: colors.accent,
  },
  solid: {
    backgroundColor: colors.down,
    color: colors.backgroundCanvas,
  },
  muted: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textMuted,
    letterSpacing: 'normal',
    textTransform: 'none',
  },
});

function toneClassName(tone: BadgeProps['tone']): string {
  return stylex.props(
    styles.base,
    tone === 'up' && styles.up,
    tone === 'down' && styles.down,
    tone === 'accent' && styles.accent,
    tone === 'solid' && styles.solid,
    tone === 'muted' && styles.muted,
  ).className;
}

export function Badge({ tone, className, children, ...rest }: BadgeProps) {
  const cls = `badge${tone ? ` badge--${tone}` : ''}${className ? ` ${className}` : ''} ${toneClassName(tone)}`;

  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}
