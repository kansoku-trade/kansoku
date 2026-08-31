import { useEffect, useState } from 'react';
import type { CanvasDoc } from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, Spinner } from '@web/ui';
import { colors, fonts, fontSizes, sizes } from '../../theme/tokens.stylex';
import { CanvasFrame } from './CanvasFrame';

const styles = stylex.create({
  pane: {
    backgroundColor: colors.backgroundCanvas,
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
    height: sizes.paneHeaderHeight,
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: '0 12px',
  },
  titles: {
    display: 'flex',
    flex: '1 1 auto',
    gap: '8px',
    minWidth: 0,
    overflow: 'hidden',
  },
  title: {
    color: colors.textPrimary,
    flex: '1 1 auto',
    fontSize: fontSizes.sm,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  slug: {
    color: colors.textMuted,
    flex: '0 1 auto',
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  body: {
    flex: '1 1 auto',
    minHeight: 0,
  },
  status: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    padding: '16px',
  },
});

export function CanvasPane({ slug, onClose }: { slug: string; onClose: () => void }) {
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
        <Button onClick={onClose}>关闭</Button>
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
        ) : (
          <CanvasFrame source={doc.source} slug={doc.slug} />
        )}
      </div>
    </div>
  );
}
