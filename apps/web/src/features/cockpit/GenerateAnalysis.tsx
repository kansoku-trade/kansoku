import * as stylex from '@stylexjs/stylex';
import { Button, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { AnalysisRunDetails } from './AnalysisRunDetails';
import { useAnalystRun } from './useAnalystRun';

const styles = stylex.create({
  control: {
    marginBottom: '12px',
  },
  reassess: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '0',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});

export function GenerateAnalysis({ sym }: { sym: string }) {
  const run = useAnalystRun(sym);

  return (
    <div className={`ai-run-control ${stylex.props(styles.control).className}`}>
      <div className={`ai-reassess ${stylex.props(styles.reassess).className}`}>
        <Button onClick={run.start} disabled={run.pending || run.running}>
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
