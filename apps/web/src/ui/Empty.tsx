import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    padding: '40px 0',
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSizes.md,
  },
});

export function Empty({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`empty ${stylex.props(styles.root).className}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </div>
  );
}
