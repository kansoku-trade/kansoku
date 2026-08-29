import type { ButtonHTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii, sizes } from '../theme/tokens.stylex';

type ButtonProps = {
  accent?: boolean;
  state?: 'busy' | 'done' | 'failed';
} & ButtonHTMLAttributes<HTMLButtonElement>;

const styles = stylex.create({
  base: {
    alignItems: 'center',
    backgroundColor: colors.backgroundElement,
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxSizing: 'border-box',
    color: colors.textPrimary,
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: fontSizes.base,
    gap: '7px',
    height: sizes.controlHeight,
    padding: '0 14px',
    ':hover:not(:disabled)': {
      borderColor: colors.accent,
    },
    ':focus-visible': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      outline: 'none',
    },
  },
  accent: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  busy: {
    color: colors.textSecondary,
    cursor: 'wait',
  },
  done: {
    borderColor: colors.up,
    color: colors.up,
  },
  failed: {
    color: colors.accent,
  },
  disabled: {
    borderColor: colors.borderStrong,
    color: colors.textMuted,
    cursor: 'default',
  },
});

export function Button({
  accent,
  state,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const styleClassName = stylex.props(
    styles.base,
    accent && styles.accent,
    state === 'busy' && styles.busy,
    state === 'done' && styles.done,
    state === 'failed' && styles.failed,
    disabled && styles.disabled,
  ).className;
  const cls = [
    'btn',
    accent && 'btn--accent',
    state && `btn--${state}`,
    className,
    styleClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={cls} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
