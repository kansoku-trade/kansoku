import { useState } from "react";
import { Card, SectionTitle } from "../../ui";
import { PrimaryRow } from "./PrimaryRow";
import { RoleRow } from "./RoleRow";
import { ROLES, type AiSettings, type Catalog, type UsageToday } from "./types";

export function RoleModelsCard({
  settings,
  catalog,
  usage,
}: {
  settings: AiSettings;
  catalog: Catalog;
  usage: UsageToday | null;
}) {
  const [primaryDraft, setPrimaryDraft] = useState(settings.roles.primary);

  return (
    <Card className="settings-roles-card">
      <SectionTitle>模型分配</SectionTitle>
      <PrimaryRow
        setting={settings.roles.primary}
        catalog={catalog}
        credentials={settings.credentials}
        onDraft={setPrimaryDraft}
      />
      {ROLES.map((role) => (
        <RoleRow
          key={role}
          role={role}
          setting={settings.roles[role]}
          primary={primaryDraft}
          catalog={catalog}
          credentials={settings.credentials}
          usage={usage?.roles[role]}
        />
      ))}
      {usage && (
        <div className="settings-usage-total">
          今日合计 ${usage.total.cost.toFixed(2)} · {usage.total.calls} 次
        </div>
      )}
    </Card>
  );
}
