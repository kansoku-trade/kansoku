import { Card, SectionTitle } from "@web/ui";
import { LicensePanel } from "./LicensePanel";

export function LicenseSection() {
  return (
    <Card className="settings-license-card" id="license-section">
      <div className="settings-card-heading">
        <SectionTitle>订阅与授权</SectionTitle>
      </div>
      <LicensePanel />
    </Card>
  );
}
