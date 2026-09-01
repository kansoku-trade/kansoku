import type { ButtonHTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii, sizes } from '../theme/tokens.stylex';

type ButtonProps = {
  accent?: boolean;
  size?: 'sm';
  state?: 'busy' | 'done' | 'failed';
} & ButtonHTMLAttributes<HTMLButtonElement>;

const styles = stylex.create({
  base: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'boxSizing': 'border-box',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.control,
    'gap': '7px',
    'height': sizes.controlHeight,
    'padding': '0 14px',
    ':not(:disabled):is([data-accent="true"])': {
      borderColor: colors.accent,
      color: colors.accent,
    },
    ':not(:disabled):is([data-state="busy"])': {
      color: colors.textSecondary,
      cursor: 'wait',
    },
    ':not(:disabled):is([data-state="done"])': {
      borderColor: colors.up,
      color: colors.up,
    },
    ':not(:disabled):is([data-state="failed"])': {
      color: colors.accent,
    },
    ':disabled': {
      borderColor: colors.borderStrong,
      color: colors.textMuted,
      cursor: 'default',
    },
    ':hover:not(:disabled)': {
      borderColor: colors.accent,
    },
    ':focus-visible': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      outline: 'none',
    },
  },
  sm: {
    fontSize: fontSizes.caption,
    gap: '5px',
    height: '24px',
    padding: '0 10px',
  },
});

export function Button({
  accent,
  size,
  state,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const styleClassName = stylex.props(styles.base, size === 'sm' && styles.sm).className;
  const cls = ['btn', accent && 'btn--accent', state && `btn--${state}`, className, styleClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={cls}
      data-accent={accent ? 'true' : undefined}
      data-state={state}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
