import { LicensePanel } from './LicensePanel';
import { SettingsGroup } from './SettingsGroup';

export function LicenseSection() {
  return (
    <SettingsGroup name="本机授权">
      <LicensePanel />
    </SettingsGroup>
  );
}
