import { Navigate } from 'react-router';
import { SETTINGS_SECTION_ROUTE } from '@web/features/settings/types';

export function Component() {
  return <Navigate to={SETTINGS_SECTION_ROUTE} replace />;
}
