import { useEffect, useState } from 'react';
import type { CanvasDoc } from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, Spinner } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { CanvasFrame } from './CanvasFrame';

export type CanvasPaneView = 'canvas' | 'source';

const styles = stylex.create({
  pane: {
    backgroundColor: colors.backgroundCanvas,
    borderLeftColor: colors.border,
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  head: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flex: '0 0 auto',
    gap: '12px',
    justifyContent: 'space-between',
    padding: '10px 12px',
  },
  titles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
  },
  slug: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    gap: '6px',
  },
  switch: {
    minWidth: 0,
  },
  body: {
    flex: '1 1 auto',
    minHeight: 0,
  },
  source: {
    backgroundColor: colors.backgroundCanvas,
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    height: '100%',
    lineHeight: 1.5,
    margin: 0,
    overflow: 'auto',
    padding: '14px 16px',
  },
  status: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    padding: '16px',
  },
});

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
    <div className={`canvas-pane ${stylex.props(styles.pane).className}`}>
      <div className={`canvas-pane-head ${stylex.props(styles.head).className}`}>
        <div className={`canvas-pane-titles ${stylex.props(styles.titles).className}`}>
          <span className={`canvas-pane-title ${stylex.props(styles.title).className}`}>
            {doc?.title ?? slug}
          </span>
          <span className={`canvas-pane-slug ${stylex.props(styles.slug).className}`}>{slug}</span>
        </div>
        <div className={`canvas-pane-actions ${stylex.props(styles.actions).className}`}>
          <div
            className={`research-view-switch ${stylex.props(styles.switch).className}`}
            role="group"
            aria-label="画布视图"
          >
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
      <div className={`canvas-pane-body ${stylex.props(styles.body).className}`}>
        {error ? (
          <div className={`canvas-pane-error ${stylex.props(styles.status).className}`}>
            {error}
          </div>
        ) : !doc ? (
          <div className={`canvas-pane-loading ${stylex.props(styles.status).className}`}>
            <Spinner /> 正在打开画布…
          </div>
        ) : view === 'source' ? (
          <pre className={`canvas-pane-source ${stylex.props(styles.source).className}`}>
            {doc.source}
          </pre>
        ) : (
          <CanvasFrame source={doc.source} slug={doc.slug} />
        )}
      </div>
    </div>
  );
}
