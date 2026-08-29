import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.4,
    marginTop: '6px',
  },
});

export function NoteBlock({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`note-block ${stylex.props(styles.root).className}${className ? ` ${className}` : ''}`}
    />
  );
}
