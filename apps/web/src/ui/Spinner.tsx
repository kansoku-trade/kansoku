import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '../theme/tokens.stylex';

const spin = stylex.keyframes({
  to: { transform: 'rotate(360deg)' },
});

const styles = stylex.create({
  root: {
    animationDuration: '0.9s',
    animationIterationCount: 'infinite',
    animationName: spin,
    animationTimingFunction: 'linear',
    borderColor: colors.borderStrong,
    borderRadius: radii.full,
    borderStyle: 'solid',
    borderTopColor: colors.accent,
    borderWidth: '2px',
    height: '11px',
    width: '11px',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
});

export function Spinner({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={clsx(stylex.props(styles.root).className, className)}
      {...rest}
    />
  );
}
