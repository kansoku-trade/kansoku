import { useMemo, useState } from 'react';
import type { TrainerView } from '@kansoku/pro-api';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';
import { IntradayChartOnly } from '../charts/intraday/IntradayChartOnly';
import type { ChartTf } from '../charts/intraday/timeframes';
import {
  buildTrainerIntradayBuilt,
  isTrainerLadderTf,
  TRAINER_PERIOD_TO_CHART_TF,
} from './payloadToIntradayBuilt';
import { TrainerPeriodSwitch } from './TrainerPeriodSwitch';

const STORAGE_NAMESPACE = 'trainer';

export interface TrainerChartProps {
  view: TrainerView;
}

export function TrainerChart({ view }: TrainerChartProps) {
  const built = useMemo(() => buildTrainerIntradayBuilt(view), [view]);
  const baseTf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
  const [requestedTf, setRequestedTf] = useState<ChartTf>(baseTf);
  const activeTf = isTrainerLadderTf(view.ladder, requestedTf) ? requestedTf : baseTf;

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
          />
        </div>
      </IntradayControlsProvider>
    </div>
  );
}
