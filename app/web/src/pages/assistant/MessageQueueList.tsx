import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { QueueItem } from "./messageQueue.js";

export function MessageQueueList({ queue, onRemove }: { queue: QueueItem[]; onRemove: (id: string) => void }) {
  return (
    <AnimatePresence initial={false}>
      {queue.length > 0 ? (
        <motion.div
          key="message-queue"
          className="assistant-queue"
          initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.15, ease: "easeIn" } }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        >
          <div className="assistant-queue-head">
            <span>待发送</span>
            <span className="assistant-queue-count">{queue.length}</span>
          </div>
          <div className="assistant-queue-items">
            {queue.map((item) => (
              <div key={item.id} className="assistant-queue-row">
                <span className="assistant-queue-text">{item.text}</span>
                {item.error ? <span className="assistant-queue-error">{item.error}</span> : null}
                <button type="button" className="assistant-queue-remove" aria-label="移出队列" onClick={() => onRemove(item.id)}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
