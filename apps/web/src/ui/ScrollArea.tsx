import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import type { Ref, UIEvent, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '../theme/tokens.stylex';

type Orientation = 'vertical' | 'horizontal';

const styles = stylex.create({
  root: {
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  viewport: {
    height: '100%',
    outline: 'none',
    width: '100%',
  },
  viewportHorizontal: {
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  viewportVertical: {
    overflowX: 'hidden',
    overflowY: 'auto',
  },
  contentVertical: {
    minWidth: 0,
    width: '100%',
  },
  scrollbar: {
    'opacity': 0.5,
    'touchAction': 'none',
    'transition': 'opacity 0.16s ease',
    'userSelect': 'none',
    ':hover': {
      opacity: 1,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  scrollbarHorizontal: {
    bottom: 0,
    height: '12px',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  scrollbarVertical: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '12px',
  },
  thumb: {
    'backgroundColor': colors.borderStrong,
    'borderRadius': radii.full,
    'transition': 'width 0.16s ease, height 0.16s ease, background-color 0.16s ease',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  thumbHorizontal: {
    'height': '5px',
    'marginTop': 'auto',
    ':active': {
      height: '9px',
    },
    ':hover': {
      height: '9px',
    },
  },
  thumbVertical: {
    'marginLeft': 'auto',
    'width': '5px',
    ':active': {
      width: '9px',
    },
    ':hover': {
      width: '9px',
    },
  },
});

export function ScrollArea({
  children,
  className,
  viewportClassName,
  contentClassName,
  orientation = 'vertical',
  viewportRef,
  onScroll,
}: {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
  orientation?: Orientation;
  viewportRef?: Ref<HTMLDivElement>;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}) {
  const viewportOrientationStyle =
    orientation === 'vertical' ? styles.viewportVertical : styles.viewportHorizontal;
  const scrollbarOrientationStyle =
    orientation === 'vertical' ? styles.scrollbarVertical : styles.scrollbarHorizontal;
  const thumbOrientationStyle =
    orientation === 'vertical' ? styles.thumbVertical : styles.thumbHorizontal;

  return (
    <BaseScrollArea.Root
      className={`scroll-area ${stylex.props(styles.root).className}${className ? ` ${className}` : ''}`}
      data-orientation={orientation}
    >
      <BaseScrollArea.Viewport
        ref={viewportRef}
        onScroll={onScroll}
        className={`scroll-area-viewport ${stylex.props(styles.viewport, viewportOrientationStyle).className}${viewportClassName ? ` ${viewportClassName}` : ''}`}
      >
        <BaseScrollArea.Content
          className={`scroll-area-content ${stylex.props(orientation === 'vertical' && styles.contentVertical).className}${contentClassName ? ` ${contentClassName}` : ''}`}
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar
        orientation={orientation}
        className={`scroll-area-scrollbar ${stylex.props(styles.scrollbar, scrollbarOrientationStyle).className}`}
      >
        <BaseScrollArea.Thumb
          className={`scroll-area-thumb ${stylex.props(styles.thumb, thumbOrientationStyle).className}`}
        />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
}
