import { Navigate } from 'react-router';
import { useProRoutes } from '@web/features/edition/useProRoutes';

export function Component() {
  const { status, routes } = useProRoutes();
  if (status === 'loading') return null;
  const ProAssistant = routes?.['/research/assistant'];
  if (ProAssistant) return <ProAssistant />;
  return <Navigate to="/research" replace />;
}
