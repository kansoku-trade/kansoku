import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii, sizes } from '../theme/tokens.stylex';

type ChipProps = {
  active?: boolean;
} & AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonHTMLAttributes<HTMLButtonElement>;

const styles = stylex.create({
  root: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.borderStrong,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'borderRadius': radii.default,
    'boxSizing': 'border-box',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.base,
    'height': sizes.controlHeight,
    'padding': '0 10px',
    'textDecoration': 'none',
    'userSelect': 'none',
    ':hover': {
      borderColor: colors.accent,
      color: colors.accent,
    },
    ':focus-visible': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      outline: 'none',
    },
  },
  active: {
    borderColor: colors.accent,
    color: colors.accent,
  },
});

export function Chip({ active, href, className, children, ...rest }: ChipProps) {
  const cls = `${stylex.props(styles.root, active && styles.active).className}${className ? ` ${className}` : ''}`;

  if (href) {
    return (
      <a className={cls} href={href} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  return (
    <button className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
