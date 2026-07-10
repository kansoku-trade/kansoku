import { Card, SectionTitle } from "../../ui";
import { RoleRow } from "./RoleRow";
import { ROLES, type AiSettings, type Catalog } from "./types";

export function RoleModelsCard({ settings, catalog }: { settings: AiSettings; catalog: Catalog }) {
  return (
    <Card className="settings-roles-card">
      <SectionTitle>模型分配</SectionTitle>
      {ROLES.map((role) => (
        <RoleRow
          key={role}
          role={role}
          setting={settings.roles[role]}
          catalog={catalog}
          credentials={settings.credentials}
        />
      ))}
    </Card>
  );
}
