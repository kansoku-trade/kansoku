import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { TrainerView } from '@kansoku/pro-api';
import { getTrainerBridge } from './features/desktop/desktopTrainerBridge';
import { TrainerChart } from './features/training/TrainerChart';
import './styles.css';

interface TrainerSession {
  sessionId: string;
  view: TrainerView;
}

function TrainerRoot() {
  const bridge = useMemo(() => getTrainerBridge(), []);
  const [session, setSession] = useState<TrainerSession | null>(null);

  useEffect(() => {
    let active = true;
    if (!bridge) return;
    bridge
      .open({ basePeriod: '5m' })
      .then((result) => {
        if (active && result.ok) {
          setSession({ sessionId: result.data.sessionId, view: result.data.view });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bridge]);

  if (!bridge || !session) return <div className="trainer-placeholder">没有可用的训练局</div>;
  return (
    <TrainerChart
      view={session.view}
      sessionId={session.sessionId}
      bridge={bridge}
      onViewChange={(view) => setSession((prev) => (prev ? { ...prev, view } : prev))}
    />
  );
}

createRoot(document.getElementById('root')!).render(<TrainerRoot />);
