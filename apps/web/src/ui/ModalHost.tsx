import {
  cloneElement,
  isValidElement,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { closeModal, getSnapshot, subscribe, type ModalEntry } from './modalStore';
import { ScrollArea } from './ScrollArea';
import { colors, fontSizes, radii } from '../theme/tokens.stylex';

const styles = stylex.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    inset: 0,
    justifyContent: 'center',
    opacity: 1,
    padding: '32px',
    position: 'fixed',
    transition: 'opacity 180ms ease',
    zIndex: 100,
  },
  backdropHidden: { opacity: 0 },
  panel: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 64px)',
    opacity: 1,
    transform: 'translateY(0) scale(1)',
    transition: 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 180ms ease',
    width: 'min(860px, 100%)',
  },
  panelHidden: { opacity: 0, transform: 'translateY(8px) scale(0.97)' },
  panelSm: { width: 'min(440px, 100%)' },
  panelMd: { width: 'min(640px, 100%)' },
  head: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    padding: '12px 18px',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: 600,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headActions: { alignItems: 'center', display: 'flex', flex: '0 0 auto', gap: '4px' },
  headAction: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: radii.default,
    borderStyle: 'none',
    borderWidth: 0,
    color: colors.textSecondary,
    cursor: 'pointer',
    display: 'inline-flex',
    height: '24px',
    justifyContent: 'center',
    padding: 0,
    width: '24px',
    ':hover': { backgroundColor: colors.backgroundHover, color: colors.textPrimary },
    ':focus-visible': { outline: colors.focusOutline, outlineOffset: '1px' },
  },
  body: { display: 'flex', flex: '1 1 auto', flexDirection: 'column', minHeight: 0 },
  bodyViewport: { flex: '1 1 auto', height: 'auto', minHeight: 0 },
  bodyContent: { padding: '16px 20px' },
});

function styledHeaderAction(action: ReactNode): ReactNode {
  if (!isValidElement<{ className?: string }>(action)) return action;
  return cloneElement(action, {
    className: [action.props.className, stylex.props(styles.headAction).className]
      .filter(Boolean)
      .join(' '),
  });
}

function ModalFrame({ entry }: { entry: ModalEntry }) {
  const close = () => closeModal(entry.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry.id]);

  const body = typeof entry.body === 'function' ? entry.body(close) : entry.body;
  const headerAction =
    typeof entry.headerAction === 'function' ? entry.headerAction(close) : entry.headerAction;
  const panelClasses = [
    'modal-panel',
    entry.size && entry.size !== 'lg' && `modal-panel--${entry.size}`,
    entry.panelClassName,
  ]
    .filter(Boolean)
    .join(' ');
  const panelStyle = stylex.props(
    styles.panel,
    entry.size === 'sm' && styles.panelSm,
    entry.size === 'md' && styles.panelMd,
    entry.state !== 'open' && styles.panelHidden,
  );

  return (
    <div
      className={`modal-backdrop ${stylex.props(
        styles.backdrop,
        entry.state !== 'open' && styles.backdropHidden,
      ).className}`}
      data-state={entry.state}
      onClick={close}
    >
      <div
        className={`${panelClasses} ${panelStyle.className}`}
        data-state={entry.state}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`modal-head ${stylex.props(styles.head).className}`}>
          <span className={`modal-title ${stylex.props(styles.title).className}`}>
            {entry.title}
          </span>
          <div className={`modal-head-actions ${stylex.props(styles.headActions).className}`}>
            {styledHeaderAction(headerAction)}
            <button
              type="button"
              className={`modal-close ${stylex.props(styles.headAction).className}`}
              onClick={close}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <ScrollArea
          className={`modal-body ${stylex.props(styles.body).className}`}
          contentClassName={`modal-body-content ${stylex.props(styles.bodyContent).className}`}
          viewportClassName={stylex.props(styles.bodyViewport).className}
        >
          {body}
        </ScrollArea>
      </div>
    </div>
  );
}

export function ModalHost() {
  const entries = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (entries.length === 0) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [entries.length]);
  return (
    <>
      {entries.map((e) => (
        <ModalFrame key={e.id} entry={e} />
      ))}
    </>
  );
}
