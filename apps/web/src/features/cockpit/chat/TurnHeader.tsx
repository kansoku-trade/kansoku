import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';

export const turnHeaderStyles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '2px 0 4px',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  interactive: {
    'padding': '2px 4px',
    'borderRadius': radii.default,
    'cursor': 'pointer',
    ':hover': {
      color: colors.textSecondary,
    },
  },
  rule: {
    backgroundColor: colors.border,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    height: '1px',
  },
});
