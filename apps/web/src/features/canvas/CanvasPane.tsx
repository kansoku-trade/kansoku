import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { CanvasDoc } from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Spinner } from '@web/ui';
import { colors, fonts, fontSizes, radii, sizes } from '../../theme/tokens.stylex';
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
    padding: '0 20px',
  },
  titles: {
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    gap: '2px',
    justifyContent: 'center',
    minWidth: 0,
    overflow: 'hidden',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    lineHeight: 1.2,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  slug: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    lineHeight: 1.2,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  close: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderRadius': radii.default,
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': '28px',
    'justifyContent': 'center',
    'padding': 0,
    'transition': 'background-color 0.12s ease, color 0.12s ease, transform 0.12s ease',
    'width': '28px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
    ':active': {
      transform: 'scale(0.96)',
    },
    ':focus-visible': {
      outline: colors.focusOutline,
      outlineOffset: '1px',
    },
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
        <button
          type="button"
          className={`canvas-pane-close ${stylex.props(styles.close).className}`}
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={14} />
        </button>
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
