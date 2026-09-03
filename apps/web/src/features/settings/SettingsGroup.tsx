import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  group: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    alignItems: 'baseline',
    display: 'flex',
    gap: '8px',
    justifyContent: 'space-between',
    padding: '0 2px 6px',
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSizes.control,
    fontWeight: 600,
  },
  list: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  row: {
    'alignItems': 'center',
    'borderTopColor': colors.border,
    'borderTopStyle': 'solid',
    'borderTopWidth': '1px',
    'display': 'flex',
    'gap': '12px',
    'justifyContent': 'space-between',
    'minWidth': 0,
    'padding': '9px 2px',
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
      gap: '8px',
    },
  },
  field: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
    padding: '9px 2px',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  side: {
    alignItems: 'center',
    display: 'flex',
    flex: 'none',
    gap: '6px',
  },
  label: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSizes.caption,
    lineHeight: 1.45,
  },
  mono: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    overflowWrap: 'anywhere',
  },
  error: {
    color: colors.down,
    fontSize: fontSizes.caption,
    lineHeight: 1.45,
  },
});

export function SettingsGroup({
  name,
  badge,
  children,
}: {
  name: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`settings-group ${stylex.props(styles.group).className}`}>
      <div className={`settings-group-header ${stylex.props(styles.header).className}`}>
        <span {...stylex.props(styles.name)}>{name}</span>
        {badge}
      </div>
      <div className={`settings-group-list ${stylex.props(styles.list).className}`}>{children}</div>
    </section>
  );
}

function RowBody({
  label,
  description,
  mono,
  error,
}: {
  label?: ReactNode;
  description?: ReactNode;
  mono?: ReactNode;
  error?: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.main)}>
      {label === undefined ? null : <span {...stylex.props(styles.label)}>{label}</span>}
      {description === undefined ? null : (
        <span {...stylex.props(styles.description)}>{description}</span>
      )}
      {mono === undefined ? null : (
        <span className={`settings-mono ${stylex.props(styles.mono).className}`}>{mono}</span>
      )}
      {error === undefined ? null : <span {...stylex.props(styles.error)}>{error}</span>}
    </div>
  );
}

export function SettingsRow({
  label,
  description,
  mono,
  error,
  children,
}: {
  label?: ReactNode;
  description?: ReactNode;
  mono?: ReactNode;
  error?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`settings-row ${stylex.props(styles.row).className}`}>
      <RowBody label={label} description={description} mono={mono} error={error} />
      {children === undefined ? null : <div {...stylex.props(styles.side)}>{children}</div>}
    </div>
  );
}

export function SettingsField({
  label,
  description,
  mono,
  error,
  children,
}: {
  label?: ReactNode;
  description?: ReactNode;
  mono?: ReactNode;
  error?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`settings-field ${stylex.props(styles.field).className}`}>
      <RowBody label={label} description={description} mono={mono} error={error} />
      {children}
    </div>
  );
}
