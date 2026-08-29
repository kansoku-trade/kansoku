import type { InputHTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii, sizes } from '../theme/tokens.stylex';

const styles = stylex.create({
  input: {
    backgroundColor: colors.backgroundElement,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: radii.default,
    boxSizing: 'border-box',
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    height: sizes.controlHeight,
    padding: '0 10px',
    ':focus-visible': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      outline: 'none',
    },
  },
});

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`input ${stylex.props(styles.input).className}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}
