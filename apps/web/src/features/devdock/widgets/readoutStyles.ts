import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes } from '../../../theme/tokens.stylex';

export const readoutStyles = stylex.create({
  text: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    color: colors.textSecondary,
    whiteSpace: 'nowrap',
  },
  mid: { color: colors.accent },
  high: { color: colors.down },
});

export function readoutClass(level: 'ok' | 'mid' | 'high' = 'ok'): string {
  return (
    stylex.props(
      readoutStyles.text,
      level === 'mid' && readoutStyles.mid,
      level === 'high' && readoutStyles.high,
    ).className ?? ''
  );
}
