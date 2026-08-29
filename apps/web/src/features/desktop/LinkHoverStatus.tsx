import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, fonts, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundElement,
    borderBottomStyle: 'none',
    borderBottomWidth: 0,
    borderColor: colors.border,
    borderLeftStyle: 'none',
    borderLeftWidth: 0,
    borderStyle: 'solid',
    borderTopRightRadius: radii.default,
    borderWidth: '1px',
    bottom: 0,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    left: 0,
    maxWidth: '60vw',
    opacity: 0,
    overflow: 'hidden',
    padding: '3px 10px',
    pointerEvents: 'none',
    position: 'fixed',
    textOverflow: 'ellipsis',
    transition: 'opacity 120ms ease',
    whiteSpace: 'nowrap',
    zIndex: 90,
  },
  visible: {
    opacity: 1,
  },
});

export function externalLinkHref(href: string | null): string | null {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return href;
}

export function truncateUrl(url: string, max = 100): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 31)}…${url.slice(-30)}`;
}

export function LinkHoverStatus() {
  const [url, setUrl] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onOver = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest('a[href]') ?? null;
      const next = externalLinkHref(anchor?.getAttribute('href') ?? null);
      if (next) {
        setUrl(next);
        setVisible(true);
      } else {
        setVisible(false);
      }
    };
    const onLeave = () => setVisible(false);
    document.addEventListener('mouseover', onOver);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div
      className={`${visible ? 'link-hover-status--visible ' : ''}${stylex.props(styles.root, visible && styles.visible).className}`}
      aria-hidden
    >
      {truncateUrl(url)}
    </div>
  );
}
