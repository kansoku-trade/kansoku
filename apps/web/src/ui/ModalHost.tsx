import { useEffect, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { closeModal, getSnapshot, subscribe, type ModalEntry } from './modalStore';
import { ScrollArea } from './ScrollArea';

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

  return (
    <div className="modal-backdrop" data-state={entry.state} onClick={close}>
      <div
        className={entry.panelClassName ? `modal-panel ${entry.panelClassName}` : 'modal-panel'}
        data-state={entry.state}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-title">{entry.title}</span>
          <div className="modal-head-actions">
            {headerAction}
            <button type="button" className="modal-close" onClick={close} aria-label="关闭">
              <X size={16} />
            </button>
          </div>
        </div>
        <ScrollArea className="modal-body" contentClassName="modal-body-content">
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
