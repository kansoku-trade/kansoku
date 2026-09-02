import * as stylex from '@stylexjs/stylex';
import { CanvasFrame } from '@web/features/canvas/CanvasFrame';
import { isDesktopRealtime } from '@web/lib/portTransport';
import { colors } from '@web/theme/tokens.stylex';
import demoSource from '@web/features/canvas/demo/kitchenSink.canvas.tsx?raw';

const styles = stylex.create({
  page: {
    backgroundColor: colors.backgroundCanvas,
    display: 'flex',
    flexDirection: 'column',
    height: '100cqh',
    overflow: 'hidden',
  },
  pageDesktop: {
    height: 'calc(100cqh - 40px)',
  },
});

export function Component() {
  return (
    <div {...stylex.props(styles.page, isDesktopRealtime() && styles.pageDesktop)}>
      <CanvasFrame source={demoSource} />
    </div>
  );
}
