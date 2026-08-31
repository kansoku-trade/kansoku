import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ResizablePanel } from '@web/ui';
import { CanvasPane } from './CanvasPane';

const styles = stylex.create({
  root: {
    display: 'flex',
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  rootClosed: {
    display: 'contents',
    overflow: 'visible',
  },
  main: {
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
  },
  mainClosed: {
    display: 'contents',
    overflow: 'visible',
  },
  pane: {
    height: '100%',
  },
});

export function CanvasSplit({
  openSlug,
  onClose,
  children,
  storageKey = 'canvas-pane-width',
}: {
  openSlug: string | null;
  onClose: () => void;
  children: ReactNode;
  storageKey?: string;
}) {
  const rootProps = stylex.props(styles.root, !openSlug && styles.rootClosed);
  return (
    <div
      {...rootProps}
      className={`${openSlug ? 'canvas-split--open ' : ''}${rootProps.className}`}
    >
      <div {...stylex.props(styles.main, !openSlug && styles.mainClosed)}>{children}</div>
      {openSlug ? (
        <ResizablePanel
          side="end"
          defaultSize={520}
          minSize={320}
          maxSize={920}
          storageKey={storageKey}
          handleLabel="调整画布宽度"
          className={stylex.props(styles.pane).className}
        >
          <CanvasPane slug={openSlug} onClose={onClose} />
        </ResizablePanel>
      ) : null}
    </div>
  );
}
