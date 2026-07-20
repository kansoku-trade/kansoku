import { useEffect } from 'react';
import { navigate } from '@web/router';

export function ResearchAssistantPage() {
  useEffect(() => {
    navigate('/research', { replace: true });
  }, []);
  return null;
}
