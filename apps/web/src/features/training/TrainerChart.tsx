import { useMemo, useState } from 'react';
import type { TrainerView } from '@kansoku/pro-api';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';
import { IntradayChartOnly } from '../charts/intraday/IntradayChartOnly';
import type { ChartTf } from '../charts/intraday/timeframes';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  buildTrainerIntradayBuilt,
  isTrainerLadderTf,
  TRAINER_PERIOD_TO_CHART_TF,
} from './payloadToIntradayBuilt';
import { TrainerOrderPanel } from './TrainerOrderPanel';
import { TrainerPeriodSwitch } from './TrainerPeriodSwitch';

const STORAGE_NAMESPACE = 'trainer';

export interface TrainerChartProps {
  view: TrainerView;
  sessionId?: string;
  bridge?: TrainerBridge;
  onViewChange?: (view: TrainerView) => void;
}

export function TrainerChart({ view, sessionId, bridge, onViewChange }: TrainerChartProps) {
  const built = useMemo(() => buildTrainerIntradayBuilt(view), [view]);
  const baseTf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
  const [requestedTf, setRequestedTf] = useState<ChartTf>(baseTf);
  const activeTf = isTrainerLadderTf(view.ladder, requestedTf) ? requestedTf : baseTf;
  const [chartHandle, setChartHandle] = useState<DrawingChartHandle | null>(null);

  return (
    <div className="trainer-shell">
      <IntradayControlsProvider storageNamespace={STORAGE_NAMESPACE}>
        <TrainerPeriodSwitch ladder={view.ladder} activeTf={activeTf} onChange={setRequestedTf} />
        <div className="trainer-body">
          <IntradayChartOnly
            symbol={view.symbol}
            built={built}
            activeTf={activeTf}
            drawings={false}
            storageNamespace={STORAGE_NAMESPACE}
            onChartHandle={setChartHandle}
          />
        </div>
      </IntradayControlsProvider>
      {bridge && sessionId && onViewChange && (
        // key remounts the panel (and its draft state) on a new case instead of
        // syncing it with an effect.
        <TrainerOrderPanel
          key={view.caseId}
          view={view}
          handle={chartHandle}
          bridge={bridge}
          sessionId={sessionId}
          onViewChange={onViewChange}
        />
      )}
    </div>
  );
}
