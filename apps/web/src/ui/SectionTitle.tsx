import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    'color': colors.textMuted,
    'fontSize': fontSizes.sm,
    'fontWeight': 600,
    'letterSpacing': '0.04em',
    'marginBottom': '6px',
    'marginTop': '18px',
    'textTransform': 'uppercase',
    ':first-child': {
      marginTop: 0,
    },
  },
  home: {
    fontSize: fontSizes.base,
  },
  withAge: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
});

export function SectionTitle({
  className,
  children,
  variant = 'default',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'home' }) {
  const withAge = className?.split(/\s+/).includes('section-title--with-age');
  return (
    <div
      className={`section-title ${stylex.props(styles.root, variant === 'home' && styles.home, withAge && styles.withAge).className}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </div>
  );
}
