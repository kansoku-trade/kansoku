import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: 500,
    letterSpacing: '0.08em',
    marginBottom: '8px',
    marginTop: '16px',
    textTransform: 'uppercase',
  },
  withAge: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
});

export function SectionTitle({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const withAge = className?.split(/\s+/).includes('section-title--with-age');
  return (
    <div
      className={`section-title ${stylex.props(styles.root, withAge && styles.withAge).className}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </div>
  );
}
