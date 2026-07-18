import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { ScrollArea } from "./ScrollArea";

export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <ScrollArea className="modal-body" contentClassName="modal-body-content">
          {children}
        </ScrollArea>
      </div>
    </div>
  );
}
