import * as stylex from '@stylexjs/stylex';
import { lazy, Suspense, type PropsWithChildren } from 'react';

const DevDock = import.meta.env.DEV
  ? lazy(() => import('./DevDock').then((m) => ({ default: m.DevDock })))
  : null;

const styles = stylex.create({
  column: { display: 'flex', flexDirection: 'column', height: '100vh' },
  // Pages size themselves with 100cqh against this box, so an open dock bar
  // shrinks them instead of pushing them under it.
  content: { flex: 1, minHeight: 0, containerType: 'size' },
});

export function DevDockLayout({ children }: PropsWithChildren) {
  if (!DevDock) return children;
  return (
    <div {...stylex.props(styles.column)}>
      <div {...stylex.props(styles.content)}>{children}</div>
      <Suspense fallback={null}>
        <DevDock />
      </Suspense>
    </div>
  );
}
