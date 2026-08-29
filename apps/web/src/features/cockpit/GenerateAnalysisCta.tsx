import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { GenerateAnalysis } from './GenerateAnalysis';

const styles = stylex.create({
  root: {
    padding: '18px 0 8px',
    textAlign: 'left',
  },
  title: {
    margin: '0 0 6px',
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: 600,
  },
  description: {
    maxWidth: '44ch',
    margin: '0 0 18px',
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
  },
});
export function GenerateAnalysisCta({
  sym,
  title,
  desc,
}: {
  sym: string;
  title: string;
  desc: string;
}) {
  return (
    <div className={`preview-cta ${stylex.props(styles.root).className}`}>
      <h3 className={`preview-cta-title ${stylex.props(styles.title).className}`}>{title}</h3>
      <p className={`preview-cta-desc ${stylex.props(styles.description).className}`}>{desc}</p>
      <GenerateAnalysis sym={sym} variant="preview" />
    </div>
  );
}
