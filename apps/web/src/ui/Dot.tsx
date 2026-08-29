import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../theme/tokens.stylex';

type DotProps = {
  tone?: 'accent' | 'ok' | 'up' | 'down';
  pulse?: boolean;
} & HTMLAttributes<HTMLSpanElement>;

const dotPulse = stylex.keyframes({
  '50%': {
    opacity: 0.3,
  },
});

const styles = stylex.create({
  dot: {
    backgroundColor: colors.textSecondary,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
    height: '7px',
    width: '7px',
  },
  accent: {
    backgroundColor: colors.accent,
  },
  ok: {
    backgroundColor: colors.ok,
  },
  up: {
    backgroundColor: colors.up,
  },
  down: {
    backgroundColor: colors.down,
  },
  pulse: {
    animationDuration: '1.5s',
    animationIterationCount: 'infinite',
    animationName: dotPulse,
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
});

export function Dot({ tone, pulse, className, ...rest }: DotProps) {
  const styleClassName = stylex.props(
    styles.dot,
    tone === 'accent' && styles.accent,
    tone === 'ok' && styles.ok,
    tone === 'up' && styles.up,
    tone === 'down' && styles.down,
    pulse && styles.pulse,
  ).className;
  const hookClassName = [
    pulse && 'dot--pulse',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={[styleClassName, hookClassName].filter(Boolean).join(' ')} {...rest} />;
}
