import * as stylex from '@stylexjs/stylex';
import { Button, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { AnalysisRunDetails } from './AnalysisRunDetails';
import { useAnalystRun } from './useAnalystRun';

const styles = stylex.create({
  control: {
    marginBottom: '12px',
  },
  previewControl: {
    marginBottom: '0',
  },
  reassess: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '0',
  },
  previewReassess: {
    justifyContent: 'flex-start',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  previewButton: {
    fontSize: fontSizes.md,
    fontWeight: 600,
    height: '32px',
    padding: '0 16px',
    ':disabled': {
      height: '32px',
    },
    ':not(:disabled)': {
      height: '32px',
    },
  },
});

type GenerateAnalysisVariant = 'default' | 'preview';

export function GenerateAnalysis({
  sym,
  variant = 'default',
}: {
  sym: string;
  variant?: GenerateAnalysisVariant;
}) {
  const run = useAnalystRun(sym);
  const isPreview = variant === 'preview';

  return (
    <div
      className={`ai-run-control ${stylex.props(styles.control, isPreview && styles.previewControl).className}`}
    >
      <div
        className={`ai-reassess ${stylex.props(styles.reassess, isPreview && styles.previewReassess).className}`}
      >
        <Button
          className={isPreview ? stylex.props(styles.previewButton).className : undefined}
          onClick={run.start}
          disabled={run.pending || run.running}
        >
          {run.running && <Spinner />}
          {run.running ? 'AI 分析中…' : 'AI 生成分析'}
        </Button>
        {run.hint && (
          <span className={`ai-hint ${stylex.props(styles.hint).className}`}>{run.hint}</span>
        )}
      </div>
      {run.status && <AnalysisRunDetails status={run.status} />}
    </div>
  );
}
