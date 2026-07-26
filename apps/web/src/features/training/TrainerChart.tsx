import { useMemo, useState } from 'react';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';
import { IntradayChartOnly } from '../charts/intraday/IntradayChartOnly';
import type { ChartTf } from '../charts/intraday/timeframes';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import {
  buildTrainerIntradayBuilt,
  isTrainerLadderTf,
  TRAINER_PERIOD_TO_CHART_TF,
  trainerAdvancePeriod,
} from './payloadToIntradayBuilt';
import { TrainerAdvanceControls } from './TrainerAdvanceControls';
import { TrainerOrderPanel } from './TrainerOrderPanel';
import { TrainerPeriodSwitch } from './TrainerPeriodSwitch';
import { TrainerSettlement } from './TrainerSettlement';

const STORAGE_NAMESPACE = 'trainer';

export interface TrainerChartProps {
  view: TrainerView;
  sessionId?: string;
  bridge?: TrainerBridge;
  onViewChange?: (view: TrainerView) => void;
}

export function TrainerChart({ view, sessionId, bridge, onViewChange }: TrainerChartProps) {
  const [epilogueBars, setEpilogueBars] = useState<RawBar[] | null>(null);
  // Reset during render (see TrainerOrderPanel's amend-draft reset for the same idiom): the
  // epilogue is revealed post-cursor data for one specific case, so it must never survive into a
  // render for a different case, not even for the one frame an effect-based reset would take.
  const [epilogueCaseId, setEpilogueCaseId] = useState(view.caseId);
  if (epilogueCaseId !== view.caseId) {
    setEpilogueCaseId(view.caseId);
    setEpilogueBars(null);
  }
  const built = useMemo(() => buildTrainerIntradayBuilt(view, epilogueBars), [view, epilogueBars]);
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
        // key remounts these panels (and their draft state) on a new case instead of
        // syncing them with an effect.
        <>
          {view.terminal ? (
            <TrainerSettlement
              key={`settlement-${view.caseId}`}
              view={view}
              bridge={bridge}
              sessionId={sessionId}
              onEpilogueBarsChange={setEpilogueBars}
            />
          ) : (
            <>
              <TrainerAdvanceControls
                key={`advance-${view.caseId}`}
                view={view}
                period={trainerAdvancePeriod(view.ladder, activeTf)}
                bridge={bridge}
                sessionId={sessionId}
                onViewChange={onViewChange}
              />
              <TrainerOrderPanel
                key={`order-${view.caseId}`}
                view={view}
                handle={chartHandle}
                bridge={bridge}
                sessionId={sessionId}
                onViewChange={onViewChange}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
