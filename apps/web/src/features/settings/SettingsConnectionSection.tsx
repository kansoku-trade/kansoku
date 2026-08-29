import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    borderTopColor: {
      default: 'transparent',
      [stylex.when.siblingBefore('[data-settings-connection-section]')]: colors.border,
    },
    borderTopStyle: {
      default: 'none',
      [stylex.when.siblingBefore('[data-settings-connection-section]')]: 'solid',
    },
    borderTopWidth: {
      default: 0,
      [stylex.when.siblingBefore('[data-settings-connection-section]')]: '1px',
    },
  },
});

export function SettingsConnectionSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  const root = stylex.props(styles.root, stylex.defaultMarker());
  return (
    <section
      {...props}
      {...root}
      className={`settings-conn-section${className ? ` ${className}` : ''} ${root.className}`}
      data-settings-connection-section=""
    />
  );
}
