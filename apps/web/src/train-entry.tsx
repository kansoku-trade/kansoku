import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { TrainerView } from '@kansoku/pro-api';
import { getTrainerBridge } from './features/desktop/desktopTrainerBridge';
import { TrainerChart } from './features/training/TrainerChart';
import './styles.css';

function TrainerRoot() {
  const [view, setView] = useState<TrainerView | null>(null);

  useEffect(() => {
    let active = true;
    const bridge = getTrainerBridge();
    if (!bridge) return;
    bridge
      .open({ basePeriod: '5m' })
      .then((result) => {
        if (active && result.ok) setView(result.data.view);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!view) return <div className="trainer-placeholder">没有可用的训练局</div>;
  return <TrainerChart view={view} />;
}

createRoot(document.getElementById('root')!).render(<TrainerRoot />);
