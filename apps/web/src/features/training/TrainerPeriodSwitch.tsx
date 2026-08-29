import * as stylex from '@stylexjs/stylex';
import { tfLabel, tfShortLabel, type ChartTf } from '../charts/intraday/timeframes';
import { TRAINER_PERIOD_TO_CHART_TF, type TrainerLadder } from './payloadToIntradayBuilt';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundCanvas,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'inline-flex',
    gap: '2px',
    padding: '2px',
  },
  button: {
    'backgroundColor': 'transparent',
    'borderRadius': radii.default,
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    'fontVariantNumeric': 'tabular-nums',
    'height': '20px',
    'lineHeight': '20px',
    'minWidth': '30px',
    'padding': '0 7px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
  },
  activeButton: {
    backgroundColor: colors.backgroundHover,
    color: colors.textPrimary,
  },
});

export interface TrainerPeriodSwitchProps {
  ladder: TrainerLadder;
  activeTf: ChartTf;
  onChange: (tf: ChartTf) => void;
}

export function TrainerPeriodSwitch({ ladder, activeTf, onChange }: TrainerPeriodSwitchProps) {
  return (
    <div
      className={`chart-timeframe-switch ${stylex.props(styles.root).className}`}
      aria-label="时间周期"
    >
      {ladder.map((period) => {
        const tf = TRAINER_PERIOD_TO_CHART_TF[period];
        return (
          <button
            key={period}
            className={
              stylex.props(styles.button, tf === activeTf && styles.activeButton).className
            }
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
