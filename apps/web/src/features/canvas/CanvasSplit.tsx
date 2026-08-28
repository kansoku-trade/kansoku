import type { ReactNode } from 'react';
import { ResizablePanel } from '@web/ui';
import { CanvasPane, type CanvasPaneView } from './CanvasPane';

export function CanvasSplit({
  openSlug,
  view,
  onClose,
  onViewChange,
  children,
  storageKey = 'canvas-pane-width',
}: {
  openSlug: string | null;
  view: CanvasPaneView;
  onClose: () => void;
  onViewChange: (view: CanvasPaneView) => void;
  children: ReactNode;
  storageKey?: string;
}) {
  return (
    <div className={`canvas-split${openSlug ? ' canvas-split--open' : ''}`}>
      <div className="canvas-split-main">{children}</div>
      {openSlug ? (
        <ResizablePanel
          side="end"
          defaultSize={520}
          minSize={320}
          maxSize={920}
          storageKey={storageKey}
          handleLabel="调整画布宽度"
          className="canvas-split-pane"
        >
          <CanvasPane slug={openSlug} view={view} onClose={onClose} onViewChange={onViewChange} />
        </ResizablePanel>
      ) : null}
    </div>
  );
}
