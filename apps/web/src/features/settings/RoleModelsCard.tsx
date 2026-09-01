import { Card, SectionTitle } from '@web/ui';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { PrimaryRow } from './PrimaryRow';
import { RoleRow } from './RoleRow';
import type { SettingsViewModel } from './settingsViewModel';
import {
  ROLES,
  type AiRoles,
  type Catalog,
  type CredentialEntry,
  type Role,
  type RoleSetting,
} from './types';

const styles = stylex.create({
  card: {
    marginBottom: 0,
    minWidth: 0,
    overflow: 'hidden',
    padding: 0,
  },
  heading: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    minHeight: '34px',
    padding: '0 11px',
  },
  title: {
    margin: 0,
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  roleList: {
    minWidth: 0,
  },
});

export function RoleModelsCard({
  initialRoles,
  roles,
  catalog,
  credentials,
  view,
  onDraftChange,
}: {
  initialRoles: AiRoles;
  roles: AiRoles;
  catalog: Catalog;
  credentials: CredentialEntry[];
  view: SettingsViewModel;
  onDraftChange: (role: Role | 'primary', next: RoleSetting) => void;
}) {
  return (
    <Card {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.heading)}>
        <SectionTitle className={stylex.props(styles.title).className}>模型分配</SectionTitle>
        <span {...stylex.props(styles.hint)}>即时生效，进行中的分析沿用旧配置</span>
      </div>
      <PrimaryRow
        initial={initialRoles.primary}
        draft={roles.primary}
        catalog={catalog}
        credentials={credentials}
        onDraftChange={(next) => onDraftChange('primary', next)}
      />
      <div {...stylex.props(styles.roleList)}>
        {ROLES.map((role) => (
          <RoleRow
            key={role}
            role={role}
            initial={initialRoles[role]}
            draft={roles[role]}
            catalog={catalog}
            credentials={credentials}
            view={view.roles[role]}
            onDraftChange={(next) => onDraftChange(role, next)}
          />
        ))}
      </div>
    </Card>
  );
}
