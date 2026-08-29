import * as stylex from '@stylexjs/stylex';
import { Button, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { useExplainSymbol } from './useExplainSymbol';

const styles = stylex.create({
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});

export function ExplainAction({ symbol }: { symbol: string }) {
  const { pending, hint, explain } = useExplainSymbol(symbol);

  return (
    <>
      <Button onClick={explain} disabled={pending}>
        {pending && <Spinner />}
        {pending ? '解读中…' : '解读当前盘面'}
      </Button>
      {hint && <span className={`ai-hint ${stylex.props(styles.hint).className}`}>{hint}</span>}
    </>
  );
}
