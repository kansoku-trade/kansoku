import * as stylex from '@stylexjs/stylex';
import { useRoute } from '../../../lib/router';
import { colors, fonts, fontSizes } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  path: {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
});

export function RoutePathWidget() {
  const route = useRoute();
  return (
    <span {...stylex.props(styles.path)} title={route}>
      {route}
    </span>
  );
}
