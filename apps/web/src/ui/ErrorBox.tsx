import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.down,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.down,
    fontSize: fontSizes.md,
    padding: '14px',
  },
});

export function ErrorBox({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`error-box ${stylex.props(styles.root).className}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </div>
  );
}
