import { Card, SectionTitle } from "@web/ui";
import { PrimaryRow } from "./PrimaryRow";
import { RoleRow } from "./RoleRow";
import type { SettingsViewModel } from "./settingsViewModel";
import {
  ROLES,
  type AiRoles,
  type Catalog,
  type CredentialEntry,
  type Role,
  type RoleSetting,
} from "./types";

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
  onDraftChange: (role: Role | "primary", next: RoleSetting) => void;
}) {
  return (
    <Card className="settings-roles-card">
      <div className="settings-card-heading">
        <SectionTitle>模型分配</SectionTitle>
        <span>改动即存即生效，进行中的一轮分析仍用旧配置</span>
      </div>
      <PrimaryRow
        initial={initialRoles.primary}
        draft={roles.primary}
        catalog={catalog}
        credentials={credentials}
        onDraftChange={(next) => onDraftChange("primary", next)}
      />
      <div className="settings-role-list">
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
