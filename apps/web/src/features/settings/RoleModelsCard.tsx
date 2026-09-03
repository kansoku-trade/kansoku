import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { SettingsGroup } from './SettingsGroup';
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
    <SettingsGroup
      name="模型分配"
      badge={<span {...stylex.props(styles.hint)}>即时生效，进行中的分析沿用旧配置</span>}
    >
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
    </SettingsGroup>
  );
}
