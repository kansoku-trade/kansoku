import { tfLabel, tfShortLabel, type ChartTf } from '../charts/intraday/timeframes';
import { TRAINER_PERIOD_TO_CHART_TF, type TrainerLadder } from './payloadToIntradayBuilt';

export interface TrainerPeriodSwitchProps {
  ladder: TrainerLadder;
  activeTf: ChartTf;
  onChange: (tf: ChartTf) => void;
}

export function TrainerPeriodSwitch({ ladder, activeTf, onChange }: TrainerPeriodSwitchProps) {
  return (
    <div className="chart-timeframe-switch" aria-label="时间周期">
      {ladder.map((period) => {
        const tf = TRAINER_PERIOD_TO_CHART_TF[period];
        return (
          <button
            key={period}
            aria-pressed={tf === activeTf}
            onClick={() => onChange(tf)}
            title={tfLabel(tf)}
          >
            {tfShortLabel(tf)}
          </button>
        );
      })}
    </div>
  );
}
