import { useEffect, useState } from 'react';
import type { CanvasDoc } from '@kansoku/core/contract/index';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, Spinner } from '@web/ui';
import { CanvasFrame } from './CanvasFrame';

export type CanvasPaneView = 'canvas' | 'source';

export function CanvasPane({
  slug,
  view,
  onClose,
  onViewChange,
}: {
  slug: string;
  view: CanvasPaneView;
  onClose: () => void;
  onViewChange: (view: CanvasPaneView) => void;
}) {
  const [doc, setDoc] = useState<CanvasDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);
    void client.canvas
      .get({ slug })
      .then((next) => {
        if (!cancelled) setDoc(next);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="canvas-pane">
      <div className="canvas-pane-head">
        <div className="canvas-pane-titles">
          <span className="canvas-pane-title">{doc?.title ?? slug}</span>
          <span className="canvas-pane-slug">{slug}</span>
        </div>
        <div className="canvas-pane-actions">
          <div className="research-view-switch" role="group" aria-label="画布视图">
            <button
              type="button"
              className={view === 'canvas' ? 'active' : ''}
              aria-pressed={view === 'canvas'}
              onClick={() => onViewChange('canvas')}
            >
              画面
            </button>
            <button
              type="button"
              className={view === 'source' ? 'active' : ''}
              aria-pressed={view === 'source'}
              onClick={() => onViewChange('source')}
            >
              源码
            </button>
          </div>
          <Button onClick={onClose}>关闭</Button>
        </div>
      </div>
      <div className="canvas-pane-body">
        {error ? (
          <div className="canvas-pane-error">{error}</div>
        ) : !doc ? (
          <div className="canvas-pane-loading">
            <Spinner /> 正在打开画布…
          </div>
        ) : view === 'source' ? (
          <pre className="canvas-pane-source">{doc.source}</pre>
        ) : (
          <CanvasFrame source={doc.source} slug={doc.slug} />
        )}
      </div>
    </div>
  );
}
