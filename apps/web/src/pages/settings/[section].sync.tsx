import { Navigate, useParams } from 'react-router';
import { SettingsPage } from '@web/features/settings/SettingsPage';
import { findSettingsSection } from '@web/features/settings/sections';
import { SETTINGS_SECTION_ROUTE } from '@web/features/settings/types';

export function Component() {
  const { section } = useParams();
  const resolved = findSettingsSection(section);
  if (!resolved) return <Navigate to={SETTINGS_SECTION_ROUTE} replace />;
  return <SettingsPage section={resolved.id} />;
}
