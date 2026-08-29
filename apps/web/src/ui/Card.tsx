import type { AnchorHTMLAttributes, HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '../theme/tokens.stylex';

const styles = stylex.create({
  card: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
    padding: '12px',
  },
  link: {
    'cursor': 'pointer',
    'color': colors.textPrimary,
    'textDecoration': 'none',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      borderColor: colors.borderStrong,
      color: colors.accent,
    },
  },
});

type CardProps = {
  link?: boolean;
} & AnchorHTMLAttributes<HTMLAnchorElement>;

export function Card({ link, href, className, children, ...rest }: CardProps) {
  const cls = `card${link || href ? ' card--link' : ''} ${stylex.props(styles.card, Boolean(link || href) && styles.link).className}${className ? ` ${className}` : ''}`;

  if (link || href) {
    return (
      <a className={cls} href={href} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <div className={cls} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
