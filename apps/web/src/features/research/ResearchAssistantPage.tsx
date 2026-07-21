import { useEffect } from 'react';
import { navigate } from '@web/lib/router';

export function ResearchAssistantPage() {
  useEffect(() => {
    navigate('/research', { replace: true });
  }, []);
  return null;
}
